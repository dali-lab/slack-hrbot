#slack-hrbot#


HRBOT asks lab members how many hours they've worked and keeps track of responses in a google spreadsheet

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


<hr> 

###TODO:###

  - different google-spreadsheet library,  this one didn't support promises so needed some work to wrap up.  Perhaps use bluebird for Promise library instead.
  - abstract out to do more than just hours -- currently all main functionality is all just dumped into ```slack.on('message',...)```. Gross. 
  - npm update all dependencies and test
  
  
 