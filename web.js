//  small slackbot that asks users for their hours on a weekly basis
//  and records the results in a google spreadsheet
//  @author tim tregubov,  2016

var express = require("express");
var logfmt = require("logfmt");
var Slack = require("slack-client");
var request = require('request');
var app = express();
var port = process.env.PORT || 5000;
var http = require('http');
var https = require('https');
var bodyParser = require('body-parser');
var spreadsheets = require('./spreadsheets');
var moment = require('moment');
var moment = require('moment-timezone');
moment.tz.setDefault("America/New_York");
var userDB = require('./user');
var qr = require('qr-image');
var Slack_Upload = require('node-slack-upload');
var fs = require("fs");

console.log("dali hr-bot starting up");

app.use(bodyParser.json()); // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({
  extended: true
})); // to support URL-encoded bodies
app.use(logfmt.requestLogger());

var token = process.env.SLACK_BOT_TOKEN, // Add a bot at https://my.slack.com/services/new/bot and copy the token here.
  autoReconnect = true,
  autoMark = true;

var slack = new Slack(token, autoReconnect, autoMark);
var slack_upload = new Slack_Upload(token);
var currentTerm = '16w'; // default at start
var currentWeek = 0; //default
var currentMembers = [];
var currentGroups = [];
var currentChannels = [];
var checkInChannel;

// get tag format for an @mention
var makeMention = function(userId) {
  return '<@' + userId + '>';
};

// check if message has an @mention
var isAtMention = function(userId, messageText) {
  var userTag = makeMention(userId);
  return messageText &&
    messageText.length >= userTag.length &&
    messageText.substr(0, userTag.length) == userTag;
};


// users in a particular channel
var getHumansForChannel = function(channel) {
  if (!channel) return [];
  return (channel.members || []).map(function(id) {
    return slack.users[id];
  });
};


// humans that are online in a channel
var getOnlineHumansForChannel = function(channel) {
  return getHumansForChannel(channel).filter(function(u) {
    return !!u && !u.is_bot && u.presence === 'active';
  });
};


// get configs from spreadsheet
var refreshConfigs = function() {
  return spreadsheets.getHRConfigs().then(function(configs) {
    currentTerm = configs.currentTerm;
    currentWeek = configs.currentWeek;
  })
};


// get channels we belong in and users and save for later
var refreshSlack = function() {
  var unreads = slack.getUnreadCount();
  channels = Object.keys(slack.channels)
    .map(function(k) {
      return slack.channels[k];
    })
    .filter(function(c) {
      return c.is_member;
    })
    .map(function(c) {
      return c.name;
    });

  groups = Object.keys(slack.groups)
    .map(function(k) {
      return slack.groups[k];
    })
    .filter(function(g) {
      return g.is_open && !g.is_archived;
    })
    .map(function(g) {
      return g.name;
    });

  currentMembers = getHumansForChannel(slack.getGroupByName(currentTerm))
    .filter(function(human) {
      return human.name != slack.self.name;
    })
    .map(function(human) {
      return human.name;
    });

  // get checkInChannel
  checkInChannel = slack.getGroupByName('check-in');

  var weekday = moment().day();

  console.log('Slack! You are @%s (%s) of %s', slack.self.name, slack.self.id, slack.team.name);
  console.log('You are in: %s', channels.join(', '));
  console.log('As well as: %s', groups.join(', '));
  console.log('You have %s unread ' + (unreads === 1 ? 'message' : 'messages'), unreads);
  console.log(currentTerm + ' members are: ' + currentMembers.join(', '));
  console.log('current weekday: ' + weekday);

};

// asks user for time
var pokeMember = function(allusers, member) {
  console.log('about to ask: ' + member);
  var timeouttime = moment().subtract(2, 'days');
  if (allusers[member] && allusers[member].lastcontact.isAfter(timeouttime)) {
    // do nothing if we've already asked this person recently
    console.log('not asking: ' + member + ' cause already asked on ' + allusers[member].lastcontact.format());
  } else {
    var msg = "Hi " + member + "!  I'm your friendly hr-bot! How many hours did you work this past week (week " + currentWeek + " of " + currentTerm + ")?";
    var channel = slack.getDMByName(member);
    // if no existing dm then open one
    if (!channel) {
      var memberid = slack.getUserByName(member).id;
      console.log('getting id for %: %s', member, memberid);
      slack.openDM(slack.getUserByName(member).id, function(dm) {
        channel = slack.getDMByName(member);
        channel.send(msg);
      });
    } else {
      channel.send(msg);
    }
  }
};

// run this to prompt members to submit their hours
var refreshAndAskHours = function() {
  return refreshConfigs()
    .then(function() {
      refreshSlack();
    })
    .then(function() {
      return userDB.getAll()
    })
    .then(function(allusers) {
      // loop through users and contact WITH DELAY to prevent slack blocking
      var i = 1;
      currentMembers.forEach(function(member) {
        setTimeout(function() {pokeMember(allusers, member);}, i * 2000);
        i++;
      });
    })
    .catch(function(err) {
      console.log(err);
    });
};

var prepQRCodeMessages = function(username) {
  console.log('generating and sending qr codes!');

  if (username != null) { // specific user
    try {
      var user = slack.getUserByName(username); // exists
      sendQRCode(username);
    } catch(err) {
      console.log('Could not find user ' + username);
    }
  } else { // all users
    var i = 1;
    currentMembers.forEach(function(member) {
      setTimeout(function() {sendQRCode(member);}, i * 2000);
      i++;
    });
  }
}

// send message and upload file to user
var sendQRCode = function(member) {
  var message = "Hi " + member + "! I'm your friendly hr-bot! I'm sending you your QR code that you'll use to check in at the next DALI meeting. If you have questions or comments talk to Pat!";

  // get channel
  var channel = slack.getDMByName(member);
  // if no existing dm then open one
  if (!channel) {
    var memberid = slack.getUserByName(member).id;
    console.log('getting id for %: %s', member, memberid);
    slack.openDM(slack.getUserByName(member).id, function(dm) {
      channel = slack.getDMByName(member);
    });
  }

  var filename = 'qr_code_' + member + '.png';

  channel.send(message);

  // write qr image with member name
  // the margin prevents the image from getting cut off in the preview
  fs.writeFileSync(filename, qr.imageSync(member, {margin: 6}));

  // upload
  slack_upload.uploadFile({
    file: fs.createReadStream(filename),
    filetype: 'auto',
    title: 'Check-in QR Code',
    initialComment: 'This will come in handy!',
    channels: channel.id,
  }, function(err) {
    if (err) {
      console.error('Error: ' + err);
    }
    else {
      console.log('sent qr code to %s', member);
    }
  });

  fs.unlinkSync(filename);
}

var qrCheckIn = function(req) {
  var username = req.body.username;
  console.log("\nchecking in user: " + username);
  spreadsheets.checkInUser(username, currentWeek, currentTerm);
  try {
    var name = slack.getUserByName(username);
    console.log("name: " + JSON.stringify(name));
    if (name == '' ) {
      name = username;
      console.log(username + ' doesn\'t have a real name set up so I just ' +
      'poked them about it');
      channel = slack.getDMByName(username);
      channel.send('Hi ' + username + ', you just checked in but I noticed ' +
        'you didn\'t have a real name set up in Slack – would you mind doing that' +
        ' for me? Try clicking on your name in the top left->Profile & account->' +
        'Edit (on the left side). Thanks:)')
    }
    checkInChannel.send(name + ' just checked in!');
  } catch(err) {
    slack.openDM(slack.getUserByName('patxu').id, function(dm) {
      channel = slack.getDMByName('patxu');
      channel.send('Someone just tried to scan in "' + username + '", but I ' +
      'can\'t find a member by that username. Help!');
    });
  }
}

//  when we first start refresh all slack stuff
slack.on('open', function() {
  refreshSlack();
});

// process any messages we get
slack.on('message', function(message) {

  //updateuserdb first
  userDB.getAll().then(function(allusers) {

    if (user.name == 'hr-bot') {
      return; // ignore from self
    }

    var type = message.type,
      channel = slack.getChannelGroupOrDMByID(message.channel),
      user = slack.getUserByID(message.user),
      time = message.ts,
      text = (message.text) ? message.text : "",
      response = '';

    // in some cases may not be able to get user?
    if (!user) {
      user = channel
    };

    console.log('Received: %s %s %s %s %s', type, (channel.is_channel ? '#' : '') + channel.name, user.name, time, text);

    var atme = isAtMention(slack.self.id, text);

    if (user.name == 'remindatron') {
      channel.send("thanks @remindatron!");

      if (moment().day() == 6) {
        refreshAndAskHours();
      }
    } else if (type == 'message' && user.name == channel.name) {

      // direct message if channel and user are the same
      console.log('contacted by: ' + channel.name + ', ' + user.name + ', ' + text);
      var anum = text.match(/\d+/g);
      var timeouttime = moment().subtract(2, 'days');

      var contactIsStale = false; //defaults for the case of new users
      var contactIsConfirmed = false;

      if (!allusers[user.name]) {
        console.log("hello new person / memory loss");
        //currentState[user.name] = { lastcontact: moment(), confirmed: false, amount: 0};
        userDB.updateAddUser(user.name, {
          lastcontact: moment(),
          confirmed: false,
          amount: 0
        });
      } else {
        contactIsStale = allusers[user.name].lastcontact.isBefore(timeouttime);
        contactIsConfirmed = allusers[user.name].confirmed;
      }

      var words = text.trim().split(/\s+/).map(function(x) {
        return x.toLowerCase();
      })
      var amount = (anum && anum.length > 0) ? anum.reduce(function(a, b) {
        return parseFloat(a) + parseFloat(b)
      }, 0) : null;

      if (words.indexOf('uploaded') >= 0 || words.indexOf('shared') >= 0) {
        channel.send("I only understand english, files are for computers.");
      } else if (text.search('Do Not Disturb mode') >= 0) {
        // for the special casae of do not disturb mode just reset anum to nothing
        channel.send('Sleep Tight!');
        anum = "";
      } else if (text.search(/fuck/i) >= 0) {
        channel.send("RUDE.");
      } else if (text.search(/kronos/i) >= 0) {
        channel.send("I don't integrate with Kronos unfortunately, so you'll still need to fill those out separately.");
      } else if (text.search(/neukom/i) >= 0) {
        channel.send("If you are a Neukom Scholar, yes, please still tell me about your hours.");
      } else if (text.search(/who/i) >= 0) {
        channel.send("Hi! I am HRBOT! A helpful slackbot who's sole purpose is to serve DALI and help collect data like weekly hours worked on a project");
      } else if ((text.search(':clock') < 0) && words.length < 2 && text.search(/:.*:/) >= 0) {
        // clock emoji are allowed
        channel.send(":bomb:");
      } else if (text.search(/show hours/i) >= 0) {
        // show all hours for the term
        spreadsheets.getAllForUser(currentTerm, user.name)
          .then(function(result) {
            console.log("hours" + result);
            channel.send('Your hours for ' + currentTerm + ' are: \n' + result + "\n to edit say:  change week 1 to 12 hours");
          })
          .catch(function(err) {
            console.log("ERROR: " + JSON.stringify(err));
            channel.send('Error encountered: ' + err);
          });
      } else if (anum && anum.length > 0) {
        console.log('processing number: ' + anum);
        // if there are numbers in the string at all
        var regexp = new RegExp(/change week (\d*) to (\d*)/i);
        var matches = regexp.exec(text);
        //check if they are trying to change and just do it, no confirmation necessary here for simplicity
        if (matches && matches.length >= 3) {
          var altamount = parseFloat(matches[2]);
          var altweek = parseInt(matches[1]);
          console.log('got changes for week: %d with hours %d for user %s', altweek, altamount, user.name);
          userDB.updateAddUser(user.name, {
            lastcontact: moment(),
            confirmed: true,
            amount: altamount
          });
          spreadsheets.updateWeekHours(user.name, altamount, altweek, currentTerm);
          channel.send("Ok! Done! You changed week " + altweek + " to " + altamount + " hours.");
        } else if (amount > 60 || amount < 0) {
          console.log('invalid amount: ' + amount);
          // don't allow greater than 60 hours or negative numbers at all ever
          channel.send("umm..." + amount + "? I doubt it!");
        } else if (amount > 20) {
          console.log("high amount warning: " + amount);
          // warn users about being over 20 but record in case
          userDB.updateAddUser(user.name, {
            lastcontact: moment(),
            confirmed: false,
            amount: amount
          });
          channel.send("Oh! Most DALI members are limited to 20 hours a week. Are you sure you want me to put down *" + amount + "* hours during week " + currentWeek + ", yes/no?");
        } else {
          console.log("confirm %s, %d, %d", user.name, currentWeek, amount);
          // otherwise confirm that this is all correct
          userDB.updateAddUser(user.name, {
            lastcontact: moment(),
            confirmed: false,
            amount: amount
          });
          channel.send("Ok! I'm putting down that you worked *" + amount + "* hours during week " + currentWeek + ", yes/no?");
        }
        console.log('end processing');
      } else if (words.indexOf('yes') >= 0 || words.indexOf('y') >= 0 || words.indexOf('ok') >= 0 || words.indexOf('yes!') >= 0) {
        // if they agree and the user has an unconfirmed amount
        if (contactIsStale || allusers[user.name].amount === undefined) {
        // if the messages are too old lets just reset
          channel.send("I've forgotten that we were talking, how much should I put down for hours worked?");
        } else {
          // if they confirm and not stale etc then lets record!
          spreadsheets.updateWeekHours(user.name, allusers[user.name].amount, currentWeek, currentTerm);
          userDB.updateAddUser(user.name, {
            confirmed: true
          });
          channel.send("Okeedokee, thanks!");
        }
      } else if (words.indexOf('no') >= 0 || words.indexOf('n') >= 0) {
        // if they say no lets unset confirmation in case
        userDB.updateAddUser(user.name, {
          confirmed: false
        });
        channel.send("Ok, so just send me the number please.");
      } else if (words.indexOf('help') >= 0 || words.indexOf('halp') >= 0 || words.indexOf('help!') >= 0) {
        // give them some help!
        channel.send("I can help! Just tell me a number (integer) and I'll put that in for your hours this past week. \n To see all your hours this term just ask me to 'show hours'. ");
      } else if (words.indexOf('lying') >= 0) {
        // give them some help!
        channel.send("I'm sorry, I'm trying my best- promise!");
      } else {
        // general confusions ensues
        channel.send("What? I only understand numbers or pleas for help.");
        spreadsheets.logUncaught(user.name, text);
      }
    } else if (atme) {
      channel.send("Please direct message me about this matter.");
    } else {
      console.log('ignoring from ' + user.name + ': ' + text);
    }
  });

});


//
slack.on('error', function(error) {
  console.error('Error: %s', JSON.stringify(error));
});


//main promise chain, get configs first
refreshConfigs().then(function() {
  slack.login();
}).catch(function(err) {
  console.log(err);
});



///////// ROUTES

app.get('/', function(req, res) {
  res.send('Hello World!');
});

// wakes up to ask on a timer
// make sure to set up a heroku scheduler or soemthing to hit this at least once a day
app.get('/refresh-and-ask-hours', function(req, res) {
  res.send('will do!');
  console.log('refresh-and-ask-hours');
  // only asks once a week on saturday
  if (moment().day() == 6) {
    console.log('refresh-and-ask-hours and ITS SATURDAY');
    refreshAndAskHours();
  }
});

//wakes up to ask on a timer
// make sure to set up a heroku scheduler or soemthing to hit this at least once a day
app.get('/force-and-ask-hours', function(req, res) {
  res.send('will do!');
  console.log('force-and-ask-hours');
  refreshAndAskHours();
});

app.get('/send-qr-codes', function(req, res) {
  res.send('will do!');
  prepQRCodeMessages(req.query.user);
});

app.post('/qr-check-in', function(req, res) {
  res.send('will do!');
  qrCheckIn(req);
});


//sets up app
var port = Number(process.env.PORT || 5000);
app.listen(port, function() {
  console.log("Listening on " + port);
});
