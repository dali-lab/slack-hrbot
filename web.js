//

var express = require("express");
var logfmt = require("logfmt");
var Slack = require("slack-client");
var request = require('request');
var GoogleSpreadsheet = require("google-spreadsheet");
var app = express();
var port = process.env.PORT || 5000;
var http = require('http');
var https = require('https');
var bodyParser = require('body-parser')

app.use(bodyParser.json()); // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({
  extended: true
})); // to support URL-encoded bodies
app.use(logfmt.requestLogger());

var token = process.env.SLACK_BOT_TOKEN, // Add a bot at https://my.slack.com/services/new/bot and copy the token here.
  autoReconnect = true,
  autoMark = true;

var slack = new Slack(token, autoReconnect, autoMark);
var lastUrgentMessageTime = 0.0;
var spreadsheet = new GoogleSpreadsheet('1eR_YVageutlLK03ZKeLeKL82eZE-ksSO-PS4ppJFjp8');
// var google_creds = {
//   client_email: process.env.CLIENT_EMAIL,
//   private_key: process.env.PRIVATE_KEY
// }
var google_creds = require('./dalilab-hrbot-8d7a1f0c4199.json');
var currentTerm = '15s'; // default at start

var makeMention = function(userId) {
  return '<@' + userId + '>';
};

var isDirect = function(userId, messageText) {
  var userTag = makeMention(userId);
  return messageText &&
    messageText.length >= userTag.length &&
    messageText.substr(0, userTag.length) === userTag;
};

var getHumansForChannel = function(channel) {
  if (!channel) return [];
  return (channel.members || []).map( function(id) { return slack.users[id]; });
};

var getOnlineHumansForChannel = function(channel) {
    return getHumansForChannel(channel).filter(function(u) { return !!u && !u.is_bot && u.presence === 'active'; });
};

// var promise = new Promise(function (resolve, reject) {
//   get('http://www.google.com', function (err, res) {
//     if (err) reject(err);
//     else resolve(res);
//   });
// });


// this connects to the spreadsheet and gets the configs
// which includes current term and dates for current term
var getHRConfigs = function() {
  spreadsheet.useServiceAccountAuth(google_creds, function(err) {
    // getInfo returns info about the sheet and an array or "worksheet" objects
    spreadsheet.getInfo(function(err, sheet_info) {
      var config_sheet = sheet_info.worksheets.filter( function(worksheet) {
        return worksheet.title == 'CONFIGS';
      })[0] || sheet_info.worksheets[0];
      // gets the rows and config values
      config_sheet.getRows(function(err, rows) {
        currentTerm = rows[0].currentterm;
      });
    });
  })
}

slack.on('open', function() {

  var unreads = slack.getUnreadCount();

  var channels = Object.keys(slack.channels)
    .map(function (k) { return slack.channels[k]; })
    .filter(function (c) { return c.is_member; })
    .map(function (c) { return c.name; });

  var groups = Object.keys(slack.groups)
    .map(function (k) { return slack.groups[k]; })
    .filter(function (g) { return g.is_open && !g.is_archived; })
    .map(function (g) { return g.name; });

  console.log('eh' + currentTerm );//+ ': ' + slack.getGroupByName(currentTerm));
  var currentMembers = getHumansForChannel(slack.getGroupByName(currentTerm));

  console.log('Welcome to Slack. You are @%s of %s', slack.self.name, slack.team.name);
  console.log('You are in: %s', channels.join(', '));
  console.log('As well as: %s', groups.join(', '));
  console.log('You have %s unread ' + (unreads === 1 ? 'message' : 'messages'), unreads);
  console.log(currentTerm + ' members are: '  + currentMembers.join(', '));

});

slack.on('message', function(message) {

  var type = message.type,
    channel = slack.getChannelGroupOrDMByID(message.channel),
    user = slack.getUserByID(message.user),
    time = message.ts,
    text = message.text,
    trimmed = message.text.substr(makeMention(slack.self.id).length).trim();
  trimmed = trimmed.replace(/^:/, '');
  response = '';

  console.log('Received: %s %s @%s %s "%s"', type, (channel.is_channel ? '#' : '') + channel.name, user.name, time, text);

  if (message.type === 'message' && isDirect(slack.self.id, message.text)) {
    console.log('contacted: ' + channel.name + ':' + user.name + ':' + message.text);
    channel.send(trimmed);
  }

  if (type == 'message') {

  }

  //if the message is in urgent-important
  // if (type === 'message' && channel.name === 'urgent-important') {
  //
  //   console.log('Received: %s %s @%s %s "%s"', type, (channel.is_channel ? '#' : '') + channel.name, user.name, time, text);
  //
  //   //only flash lights if it's been 90 seconds since the last message
  //   if (message.ts - lastUrgentMessageTime > 90) {
  //     request({
  //         url: "http://dali-lights.herokuapp.com",
  //         method: "POST",
  //         json: {
  //           text: "pulse"
  //         },
  //       },
  //       function(error, response, body) {
  //         if (!error && response.statusCode == 200) {
  //           console.log(body)
  //         }
  //       }
  //     );
  //
  //     console.log('!!!message in todos!!!');
  //   }
  //   lastUrgentMessageTime = parseFloat(time);
  // }
});

slack.on('error', function(error) {
  console.error('Error: %s', error);
});



//main

getHRConfigs();
slack.login();


//routes

app.get('/', function(req, res) {
  res.send('Hello World!');
});

app.get('/test', function(req, res) {
  console.log(google_creds);
  spreadsheet.useServiceAccountAuth(google_creds, function(err) {
    // getInfo returns info about the sheet and an array or "worksheet" objects
    spreadsheet.getInfo(function(err, sheet_info) {
      console.log(sheet_info.title + ' is loaded');
      // use worksheet object if you want to stop using the # in your calls
      console.log(sheet_info.worksheets);
      var sheet1 = sheet_info.worksheets[0];
      console.log(sheet1.colCount);
      sheet1.getRows(function(err, rows) {
        console.log(Object.keys(rows[0]));
      });
      // var sheet1 = sheet_info.worksheets[0];
      // sheet1.getRows( function( err, rows ){
      //     rows[0].colname = 'new val';
      //     rows[0].save(); //async and takes a callback
      //     rows[0].del();  //async and takes a callback
      // });
    });

    // // column names are set by google and are based
    // // on the header row (first row) of your sheet
    // spreadsheet.addRow( 2, { colname: 'col value'} );
    //
    // spreadsheet.getRows( 2, {
    //     start: 100,          // start index
    //     num: 100,              // number of rows to pull
    //     orderby: 'name'  // column to order results by
    // }, function(err, row_data){
    //     // do something...
    // });
  })

  console.log(req);
  res.send('hello');

});


// //called by trello when cards are created
// app.post('/trello-webhook', function(req, res) {
//   res.send('Hello World!');
//   console.log('REQUEST POSTED\n' + JSON.stringify(req.body));
//
//   //the kind of thing that was done
//   var actionType = req.body.action.type;
//   //description of thing
//   var brief = req.body.action.data.card.name;
//
//
//   //mapping of trello boards to slack users
//   var boardsAndPeople = {
//     'Technical Director': '<@tim>',
//     'Administrations': '<@kaitlin>',
//     'Lead Designer': '<@alisonleung>',
//     'Marketing': '<@sofia>',
//     'Project Management': '<@sean> & <@tim_serkes>',
//     'Digital Arts Apprentice': '<@mattstanton>',
//     'Mentor Tasks': 'mentors'
//   };
//   //mapping of trello usernames to slack usernames
//   var TrelloNamesAndPeople = {
//     'Tim Tregubov': '<@tim>',
//     'Lorie Loeb': '<@lorie>',
//     'Sean Oh': '<@sean>',
//     'Kaitlin Maier': '<@kaitlin>',
//     'Alison Leung': '<@alisonleung>',
//     'Sofia Rainaldi': '<@sofia>',
//     'Tim Serkes': '<@tim_serkes>',
//   'Matt Stanton': '<@mattstanton>',
//   'Nook Harquail': '<@nook>',
//   'Marissa Allen': '<@marissa>',
//   'Runi Goswami': '<@runi>',
//   'Mentor Tasks': 'mentors'
// };
//
// //the name of the assigner
// var assigner = req.body.action.memberCreator.fullName;
// //link to the card
// var linky = req.body.action.data.card.shortLink;
//
// var staffGroup = slack.getGroupByName('staff');
// //a new card was created
// if (actionType == 'createCard') {
//   //board the thing was posted on
//   var boardAssignedTo = req.body.action.data.list.name;
//
//     function taskassignedToBoard(board) {
//       //person the thing was assigned to
//       var asignee = boardsAndPeople[board];
//       if (!asignee) {
//         asignee = board;
//       }
//       //underscores make it italics
//       var response = '_' + brief + '_ ' + 'assigned to ' + asignee + ' \nhttp://trello.com/c/' + linky;
//       staffGroup.send(response);
//     }
//     taskassignedToBoard(boardAssignedTo);
//   }
//   //card finished or updated
//   else if (actionType == 'updateCard') {
//     var destinationBoard = req.body.action.data.listAfter.name;
//     //card completed
//     if (destinationBoard == 'Done') {
//       var response = 'completed by ' + TrelloNamesAndPeople[assigner] + ': _' + brief + '_ ' + ' \nhttp://trello.com/c/' + linky;
//       staffGroup.send(response);
//     }
//     //card updated
//     else {
//       var response = 'Trello card updated' + ' \nhttp://trello.com/c/' + linky;
//     }
//   }
//
// });

//
// //called by trello when cards are created
// app.post('/trello-webhook-mn', function(req, res) {
//
//
//   //         res.statusCode = 410;
//   res.send('Hello World!');
//
//   console.log('REQUEST POSTED\n' + JSON.stringify(req.body));
//
//   //the kind of thing that was done
//   var actionType = req.body.action.type;
//   //description of thing
//   var brief = req.body.action.data.card.name;
//
//
// //mapping of trello boards to slack users
// //         var boardsAndPeople = {'Technical Director': '<@tim>','Administrations': '<@kaitlin>','Lead Designer': '<@alisonleung>','Marketing': '<@sofia>','Project Management':'<@sean> & <@tim_serkes>','Digital Arts Apprentice': '<@mattstanton>','Mentor Tasks': 'mentors'};
// //mapping of trello usernames to slack usernames
// var TrelloNamesAndPeople = {
//   'Tim Tregubov': '<@tim>',
//   'Lorie Loeb': '<@lorie>',
//   'Sean Oh': '<@sean>',
//   'Kaitlin Maier': '<@kaitlin>',
//   'Alison Leung': '<@alisonleung>',
//   'Sofia Rainaldi': '<@sofia>',
//   'Tim Serkes': '<@tim_serkes>',
//   'Matt Stanton': '<@mattstanton>',
//   'Nook Harquail': '<@nook>',
//   'Marissa Allen': '<@marissa>',
//   'Runi Goswami': '<@runi>',
//   'Mentor Tasks': 'mentors'
// };
//
// //the name of the assigner
// var assigner = req.body.action.memberCreator.fullName;
// //link to the card
// var linky = req.body.action.data.card.shortLink;
//
// var mnGroup = slack.getGroupByName('mn');
// //a new card was created
// if (actionType == 'createCard') {
//   //board the thing was posted on
//   var boardAssignedTo = req.body.action.data.list.name;
//
//   function taskassignedToBoard(board) {
//     //person the thing was assigned to
//     var asignee = board;
//     //         if(!asignee){
//     //         asignee = board;
//     //         }
//     //underscores make it italics
//     var response = '_' + brief + '_ ' + 'assigned to ' + asignee + ' \nhttp://trello.com/c/' + linky;
//     mnGroup.send(response);
//   }
//   taskassignedToBoard(boardAssignedTo);
// }
// //card finished or updated
// else if (actionType == 'updateCard') {
//   var destinationBoard = req.body.action.data.listAfter.name;
//   //card completed
//   if (destinationBoard == 'Done') {
//     var response = 'completed by ' + TrelloNamesAndPeople[assigner] + ': _' + brief + '_ ' + ' \nhttp://trello.com/c/' + linky;
//     mnGroup.send(response);
//   }
//   //card updated
//   else {
//     var response = 'Trello card updated' + ' \nhttp://trello.com/c/' + linky;
//     }
//   }
//
// });

// app.get('/trello-webhook-mn', function(req, res) {
//
//   res.send('Hello Trello!');
//
//   console.log(req);
//
// });

var port = Number(process.env.PORT || 5000);
app.listen(port, function() {
  console.log("Listening on " + port);
});
