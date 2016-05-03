#slack-hrbot ![travis_ci](https://travis-ci.org/dali-lab/slack-hrbot.svg?branch=travisci)


HRBOT asks lab members how many hours they've worked and keeps track of responses in a google spreadsheet. It also has a qr-code check in system.

##Architecture at a glance:##

  - [nodejs](https://nodejs.org/en/) + [expressjs](http://expressjs.com/)
  - [google-spreadsheets](https://www.npmjs.com/package/google-spreadsheet) to store responses
  - persists some state about individual chats into [mongo](https://www.mongodb.com)
  - [moment.js](http://momentjs.com/) for time manipulations
  - runs on [heroku](http://heroku.com)


###Heroku Vars:###


    === dali-hrbot Config Vars
    # from google
    SPREADSHEET
    CLIENT_EMAIL
    CLIENT_ID
    PRIVATE_KEY
    PRIVATE_KEY_ID
    TYPE
	#from slack
    SLACK_BOT_TOKEN
    #from heroku mongolab integration
    MONGOLAB_URI

## QR Code Check-in System
The check-in system is used to easily count the number of people who show up to certain events. In our case, we have a specific Slack setup that ties into this app. HRBot will send a QR code to everyone in a channel. These codes can then the be scanned in using our [iOS app](https://github.com/dali-lab/check-in) which scans in a QR and sends it over to HRBot.

<hr>

###TODO:###

  - different google-spreadsheet library,  this one didn't support promises so needed some work to wrap up.  Perhaps use bluebird for Promise library instead.
  - abstract out to do more than just hours -- currently all main functionality is all just dumped into ```slack.on('message',...)```. Gross.
  - npm update all dependencies and test
