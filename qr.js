var qr_image = require('qr-image');
var Slack_Upload = require('node-slack-upload');
var fs = require("fs");
var giphy = require('giphy-api')();

var token = process.env.SLACK_BOT_TOKEN;
var slack_upload = new Slack_Upload(token);

// giphy search terms
var giphy_search = ['hi', 'hello', 'yay', 'happy', 'cute', 'welcome', 'kitten', 'puppy', 'food', 'bunny', 'otter', 'panda'];

var qr = {

  prepQRCodeMessages: function(username, currentMembers, slack) {
    console.log('generating and sending qr codes!');

    if (username !== undefined) { // specific user
      try {
        var user = slack.getUserByName(username); // exists
        var message = "Hi " + username + "! I'm your friendly hr-bot! I'm sending you your QR code that you'll use to check in at the next DALI meeting. If you have questions or comments talk to Pat!";
        qr.sendQRCode(username, message, slack);
      } catch(err) {
        console.log('Error while sending qr code to %s (%s)', username, err);
      }
    } else { // all users
      var i = 1;
      currentMembers.forEach(function(member) {
        var message = "Hi " + member + "! I'm your friendly hr-bot! I'm sending you your QR code that you'll use to check in at the next DALI meeting. If you have questions or comments talk to Pat!";
        setTimeout(function() {
          qr.sendQRCode(member, message, slack);
        }, i * 3000);
        i++;
      });
    }
  },

  // send message and upload file to user
  sendQRCode: function(member, message, slack) {
    // get channel
    var channel = slack.getDMByName(member);
    // if no existing dm then open one
    if (!channel) {
      var memberid = slack.getUserByName(member).id;
      console.log('getting id for %: %s', member, memberid);
      slack.openDM(slack.getUserByName(member).id, function(dm) {
        channel = slack.getDMByName(member);
        channel.send(message);
        qr.upload_file(channel, member, 1);
      });
    } else {
      channel.send(message);
      qr.upload_file(channel, member, 1);
    }
  },

  // upload a file
  upload_file: function(channel, member, tries) {
    var filename = 'qr_code_' + member + '.png';

    // write qr image with member name
    // the margin prevents the image from getting cut off in the preview
    fs.writeFileSync(filename, qr_image.imageSync(member, {margin: 6}));

    // upload
    slack_upload.uploadFile({
      file: fs.createReadStream(filename),
      filetype: 'auto',
      title: 'Check-in QR Code',
      initialComment: 'This will come in handy!',
      channels: channel.id,
    }, function(err) {
      if (err) {
        console.error('Failed to send qr code due to error (%s)', err);
        if (tries < 3) {
          console.error('Trying to reupload file, tries = %d', tries);
          qr.upload_file(channel, member, tries + 1);
        }
      } else {
        console.log('sent qr code to %s', member);
      }
    });

    fs.unlinkSync(filename);
  },

  // check a user in from the iOS check in app
  qrCheckIn: function(username, slack, checkInChannel) {
    console.log("\nchecking in user: " + username);
    try {
      var name = slack.getUserByName(username).profile.first_name;
      if (!name) {
        name = username;
        console.log(username + ' doesn\'t have a real name set up so I just ' +
        'poked them about it');
        channel = slack.getDMByName(username);
        channel.send('Hi ' + username + ', you just checked in but I noticed ' +
          'you didn\'t have a real name set up in Slack – would you mind doing that' +
          ' for me? Try clicking on your name in the top left->Profile & account->' +
          'Edit (on the right side). Thanks:)');
      }
      checkInChannel.send('*' + name + '* just checked in!');
      qr.sendFunMessage(checkInChannel);
    } catch(err) {
      console.log('Error while checking in user (%s)', err);
      slack.openDM(slack.getUserByName('patxu').id, function(dm) {
        channel = slack.getDMByName('patxu');
        channel.send('Someone just tried to scan in "' + username + '", but I ' +
        'can\'t find a member by that username. Help!');
      });
    }
  },

  // send a fun message to a channel
  // currently sends a gif using the giphy api based on our search terms
  sendFunMessage: function(channel) {
    var search_term = giphy_search[Math.floor(Math.random() * giphy_search.length)];
    console.log('searching for a ' + search_term + ' gif!');
    giphy.search({
      q: search_term,
      limit: 100,
      rating: 'g'
    }, function(err, res) {
      if (err) {
        console.log('Error: ' + err );
      } else {
        if (res.data.length !== 0) {
          var url = res.data[Math.floor(Math.random() * res.data.length)].images.fixed_height.url;
          console.log('found giphy url: ' + url);
          channel.send(url);
        } else {
          console.log('couldn\'t find a gif with that query! :(');
        }
      }
    });
  },

};

module.exports = qr;
