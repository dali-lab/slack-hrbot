//  small slackbot that asks users for their hours on a weekly basis
//  and records the results in a google spreadsheet
//  @author tim tregubov and pat xu,  2016

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
var qr = require('./qr');

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
var currentTerm = '16w'; // default term
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
  console.log("refreshing configs");
  return spreadsheets.getHRConfigs().then(function(configs) {
    currentTerm = configs.currentTerm;
    currentWeek = configs.currentWeek;
  });
};

// send DM with message to member
var sendDM = function(member, message) {
    var channel = slack.getDMByName(member);
    if (!channel) {
      var memberid = slack.getUserByName(member).id;
      console.log('getting id for %s: %s', member, memberid);
      slack.openDM(memberid, function(dm) {
        channel = slack.getDMByName(member);
        channel.send(message);
      });
    } else {
      channel.send(message);
    }
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
    })
    .sort();

  // get checkInChannel
  checkInChannel = slack.getGroupByName('check-in');

  // make sure we're in the current term's channel
  if (groups.indexOf(currentTerm) == -1) {
    var labAdministrator = "theo";
    var msg = "Hi " + labAdministrator + ", could you please add me to the " + currentTerm + " channel? Can you also make sure that the DALI Lab Hours spreadsheet contains a \'" + currentTerm + "\' and a \'" + currentTerm + "-check-in\' sheet?";
    sendDM(labAdministrator, msg);

    console.log('not a part of the ' + currentTerm + 'channel, so I will contact ' + labAdministrator + ' to get myself added');
  }

  var weekday = moment().day();

  console.log('Slack! You are @%s (%s) of %s', slack.self.name, slack.self.id, slack.team.name);
  console.log('You are in: %s', channels.join(', '));
  console.log('As well as: %s', groups.join(', '));
  console.log('You have %s unread ' + (unreads === 1 ? 'message' : 'messages'), unreads);
  console.log(currentTerm + ' members are: ' + currentMembers.join(', '));
  console.log('current weekday: ' + weekday);

};

// asks user for time
var pokeMember = function(allusers, member, addonMsg, timeoutCheck) {
  console.log('asking hours from: ' + member);
  var timeouttime = moment().subtract(2, 'days');
  if (timeoutCheck && allusers[member] && allusers[member].lastcontact.isAfter(timeouttime)) {
    // do nothing if we've already asked this person recently
    console.log('not asking: ' + member + ' cause already asked on ' + allusers[member].lastcontact.format());
  } else {
    var msg = "Hi " + member + "! " + addonMsg;
    var channel = slack.getDMByName(member);
    // if no existing dm then open one
    if (!channel) {
      var memberid = slack.getUserByName(member).id;
      console.log('getting id for %s: %s', member, memberid);
      slack.openDM(memberid, function(dm) {
        channel = slack.getDMByName(member);
        channel.send(msg);
      });
    } else {
      channel.send(msg);
    }
    userDB.updateAddUser(member, {
      confirmed: false
    });
  }
};

// run this to prompt members to submit their hours
var refreshAndAskHours = function() {
  return refreshConfigs()
    .then(function() {
      refreshSlack();
    })
    .then(function() {
      return userDB.getAll();
    })
    .then(function(allusers) {
      // loop through users and contact WITH DELAY to prevent slack blocking
      var msg = "I'm your friendly hr-bot! How many hours did you work this past week (week " + currentWeek + " of " + currentTerm + ")?";
      var i = 1;
      currentMembers.forEach(function(member) {
        setTimeout(function() {pokeMember(allusers, member, msg, true);}, i * 2000);
        i++;
      });
    })
    .catch(function(err) {
      console.log(err);
    });
};

var getMissingHours = function(user) {
  userDB.getAll().then(function(allusers) {
    if (user !== undefined) { // bug just one user

    } else { // bug everyone
      var i = 1;
      currentMembers.forEach(function(member) {
          var lastWeekWorked = 0;
          try {
            lastWeekWorked = allusers[member].lastWeekWorked;
            if (isNaN(lastWeekWorked)) {
              throw "lastWeekWorked is NaN";
            }
          } catch (err) {
            console.log("user doesn't have a lastWeekWorked, adding to db");
            userDB.updateAddUser(member, {
              lastWeekWorked: 0
            });
          }

          var diff = currentWeek - lastWeekWorked;
          if (diff !== 0) {
            console.log("poke %s for not filling out hours for week %s", member, currentWeek);
            var msg = "Can you please let me know how many hours you worked for this past week (week *" + currentWeek + "* of " + currentTerm + ")? It's important that we have an idea of how much time you spend on your DALI project each week. This is the last time I will ask you for your hours– after this a human will directly message you.";
            setTimeout(function() {pokeMember(allusers, member, msg, false);}, i * 2000);
            i++;
          }
      });
    }
  });
};

var getHoursReport = function(week) {
  var missingHours = [];
  userDB.getAll().then(function(allusers) {
    currentMembers.forEach(function(member) {
      var lastWeekWorked = 0;
      try {
        lastWeekWorked = allusers[member].lastWeekWorked;
        if (isNaN(lastWeekWorked)) {
          throw "lastWeekWorked is NaN";
        }
      } catch (err) {
        console.log("user doesn't have a lastWeekWorked, adding to db");
        userDB.updateAddUser(member, {
          lastWeekWorked: 0
        });
      }

      var diff = week - lastWeekWorked;
      if (diff > 0) {
        console.log("adding %s to the missing hours report for week %d", member, week);
        missingHours.push(member);
      }
    });
  })
  .then(function() {
    var admin = ["patxu", "theo", "tim"];
    console.log("sending the hours report to admins (%s)", admin.join(', '));
    admin.forEach(function(member, index) {
      var otherAdmins = admin.filter(function(u) {
        return u != member;
      });
      var msg = "Hi " + member + ". The following " + missingHours.length + " members haven't submitted hours for week *" + week + "*:\n\n" + missingHours.join("\n") + "\n\nThis report was also sent to " + otherAdmins.join(", ") + ". HRBot _attack mode_ disengage.";
      var channel = slack.getDMByName(member);
      // if no existing dm then open one
      if (!channel) {
        console.log("no channel");
        var memberid = slack.getUserByName(member).id;
        console.log('getting id for %s: %s', member, memberid);
        slack.openDM(memberid, function(dm) {
          channel = slack.getDMByName(member);
          channel.send(msg);
        });
      } else {
        channel.send(msg);
      }
    });
  });
};

//  when we first start refresh all slack stuff
slack.on('open', function() {
  refreshSlack();
});

// process any messages we get
slack.on('message', function(message) {

  //updateuserdb first
  userDB.getAll().then(function(allusers) {

    var type = message.type,
      channel = slack.getChannelGroupOrDMByID(message.channel),
      user = slack.getUserByID(message.user),
      time = message.ts,
      text = (message.text) ? message.text : "",
      response = '';

    // in some cases may not be able to get user?
    if (!user) {
      console.log('Couldn\'t get user, using channel (%s)', channel.name);
      user = channel;
    }

    if (user.name == 'hr-bot') {
      return;
    }

    if (channel.name == 'check-in') {
      return; // ignore from self
    }

    console.log('Received: %s %s %s %s %s', type, (channel.is_channel ? '#' : '') + channel.name, user.name, time, text);

    var atme = isAtMention(slack.self.id, text);

    if (user.name == 'remindatron') {
      channel.send("thanks @remindatron!");

      if (moment().day() == 6) {
        refreshAndAskHours();
      }
    } else if (channel.name == '16w' || channel.name == '16s' || channel.name == '16x' || channel.name == '16f' || channel.name == '17w' || channel.name == '17s' || channel.name == '17x') {
      console.log("ignoring channel name: " + channel.name);
      // do nothing if contacted on termly channel
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
      });
      var amount = (anum && anum.length > 0) ? anum.reduce(function(a, b) {
        return parseFloat(a) + parseFloat(b);
      }, 0) : null;

      if (words.indexOf('uploaded') >= 0 || words.indexOf('shared') >= 0) {
        channel.send("I only understand english, files are for computers.");
      } else if (text.search('Do Not Disturb mode') >= 0) {
        // for the special casae of do not disturb mode just reset anum to nothing
        channel.send('Sleep Tight!');
        anum = "";
      } else if (text.search(/hey/i) >= 0 || text.search(/hello/i) >= 0 || text.search(/hi/i) >= 0) {
        channel.send("Hey there! You can tell me how many hours you worked this week, check your past input history ('show hours'), and update previous hours worked.");
      } else if (text.search(/thanks/i) >= 0) {
        channel.send("You're welcome!");
      } else if (text.search(/fuck/i) >= 0) {
        channel.send("RUDE.");
      } else if (text.search(/is.*week.*\?/i) >= 0) {
        channel.send("If you are asking what week it is, I think it is week " + currentWeek + ". Already!");
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
            console.log("hours: " + result);
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
          var lastWeekWorked = 0;
          try {
            lastWeekWorked = allusers[user.name].lastWeekWorked;
          } catch (err) {
            console.log("user doesn't have a lastWeekWorked, adding to db");
            userDB.updateAddUser(user.name, {
              lastWeekWorked: 0
            });
          }
          userDB.updateAddUser(user.name, {
            lastcontact: moment(),
            confirmed: true,
            amount: altamount,
            lastWeekWorked: Math.max(lastWeekWorked, altweek)
          });
          spreadsheets.updateWeekHours(user.name, altamount, altweek, currentTerm);
          channel.send("Ok! Done! You changed week " + altweek + " to " + altamount + " hours.");
        } else if (amount > 60 || amount < 0) {
          console.log('invalid amount: ' + amount);
          // don't allow greater than 60 hours or negative numbers at all ever
          channel.send("umm... " + amount + "? I doubt it!");
        } else if (amount > 20) {
          console.log("high amount warning: " + amount);
          // warn users about being over 20 but record in case
          userDB.updateAddUser(user.name, {
            lastcontact: moment(),
            confirmed: false,
            amount: amount
          });
          channel.send("Oh! Are you sure you want me to put down *" + amount + "* hours during week *" + currentWeek + "*, yes/no? Most DALI members are limited to 20 hours a week. ");
          spreadsheets.logUncaught(user.name, text); // lot's of errors w/ this– might as well log
        } else {
          console.log("confirm %s, %d, %d", user.name, currentWeek, amount);
          // otherwise confirm that this is all correct
          userDB.updateAddUser(user.name, {
            lastcontact: moment(),
            confirmed: false,
            amount: amount
          });
          channel.send("Ok! I'm putting down that you worked *" + amount + "* hours during week *" + currentWeek + "*, yes/no?");
        }
        console.log('end processing');
      } else if (words.indexOf('yes') >= 0 || words.indexOf('y') >= 0 || words.indexOf('ok') >= 0 || words.indexOf('yes!') >= 0) {
        // if they agree and the user has an unconfirmed amount
        if (contactIsStale || allusers[user.name].amount === undefined) {
        // if the messages are too old (2 days) let's just reset
          channel.send("I've forgotten that we were talking, how much should I put down for hours worked during week *" + currentWeek + "*?");
        } else {
          // if they confirm and not stale etc then let's record!
          spreadsheets.updateWeekHours(user.name, allusers[user.name].amount, currentWeek, currentTerm);
          userDB.updateAddUser(user.name, {
            confirmed: true,
            lastWeekWorked: currentWeek
          });
          channel.send("Okeedokee, thanks!\nTo see all your hours this term just ask me to 'show hours'.");
        }
      } else if (words.indexOf('no') >= 0 || words.indexOf('n') >= 0 || words.indexOf('no.') >= 0) {
        // if they say no lets unset confirmation in case
        userDB.updateAddUser(user.name, {
          confirmed: false
        });
        channel.send("Ok, so just send me the number please.\nTo see all your hours this term just ask me to 'show hours'.");
      } else if (words.indexOf('help') >= 0 || words.indexOf('halp') >= 0 || words.indexOf('help!') >= 0) {
        // give them some help!
        channel.send("I can help! Just tell me a number (integer) and I'll put that in for your hours this past week. \n To see all your hours this term just ask me to 'show hours'. ");
      } else if (text.search(/thank you/i) >= 0 || text.search(/thanks/i) >= 0) {
        channel.send("You are very welcome! Have a good day!");
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
  }).catch(function(err) {
    console.log('Error while fetching users: ' + err);
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
  // only asks once a week on saturday
  if (moment().day() == 6 && currentWeek <= 10) {
    console.log('refresh-and-ask-hours and IT\'S SATURDAY');
    refreshAndAskHours();
  } else {
    console.log('refresh-and-ask-hours but it\'s either not the right day or the right week!');
  }
});

//wakes up to ask on a timer
// make sure to set up a heroku scheduler or soemthing to hit this at least once a day
app.get('/force-and-ask-hours', function(req, res) {
  res.send('will do!');
  console.log('force-and-ask-hours');
  refreshAndAskHours();
});

// gets users who have not filled out their hours for the past week
app.get('/get-missing-hours', function(req, res) {
  res.send('will do!');
  if (moment().day() === 0 && currentWeek <= 10) { // sunday
    console.log('get missing hours');
    getMissingHours();
  } else {
    console.log("get missing hours but it's either not the right day or the right week");
  }
});

app.get('/get-hours-report', function(req, res) {
  var week = req.query.week;
  if (week && !isNaN(week)) {
    res.send('will do!');
    console.log('get hours report for week %d', week);
    getHoursReport(week);
  } else if (moment().day() === 1) {
    res.send('will do!');
    console.log('get hours report for last week');
    refreshConfigs().then(function() {
      getHoursReport(currentWeek-1);
    });
  } else {
    console.log("get hours report but it's not the right day");
  }
});

// send qr codes to users
app.get('/send-qr-codes', function(req, res) {
  res.send('will do!');
  if (moment().day() == 3 && currentWeek <= 10) {
    console.log('send-qr-codes and IT\'S WEDNESDAY!');
    qr.prepQRCodeMessages(req.query.user, currentMembers, slack);
  } else {
    console.log('send-qr-codes but it\'s either not the right day or the right week!');
  }
});

// check in a scanned qr code
app.post('/qr-check-in', function(req, res) {
  res.send('will do!');
  var username = req.body.username;
  qr.qrCheckIn(username, slack, checkInChannel);
  spreadsheets.checkInUser(username, currentWeek, currentTerm);
});

//sets up app
var port = Number(process.env.PORT || 5000);
app.listen(port, function() {
  console.log("Listening on " + port);
});
