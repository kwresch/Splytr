// config/passport.js

var LocalStrategy         = require('passport-local').Strategy;
var Strategy              = require('passport-facebook').Strategy;
var mysql                 = require('mysql');
var bcrypt                = require('bcrypt-nodejs');
var dbconfig              = require('./database');
var flash                 = require('connect-flash');

var connection = mysql.createConnection(dbconfig.connection);

connection.connect(function(err) {
  if (err) throw err    
  console.log('You are now connected...')
})

connection.query('USE ' + dbconfig.database);
module.exports = function(passport) {
    passport.serializeUser(function(user, done) {
        done(null, user.id);
    });

    passport.deserializeUser(function(id, done) {
        connection.query("SELECT * FROM accounts WHERE id = ? ",[id], function(err, rows){
            done(err, rows[0]);
        });
    });


passport.use(new Strategy({
    clientID: "611923268955973",
    clientSecret: "bfe7605557db8583f683c7addf900b8c",
    callbackURL: '/profile'
  },
  function(accessToken, refreshToken, profile, cb) {
    return cb(null, profile);
  }));

passport.use(
        'local-signup',
        new LocalStrategy({
            // by default, local strategy uses username and password, we will override with email
            usernameField : 'username',
            passwordField : 'password',
            passReqToCallback : true // allows us to pass back the entire request to the callback
        },
        function(req, username, password, done) {
            // find a user whose email is the same as the forms email
            // we are checking to see if the user trying to login already exists
            if(req.body.password != req.body.confirm_password) {
                console.log("password doesnt match");
                return done(null, false, req.flash('signupMessage', 'The passowrds dont match.'));
            }
            connection.query("SELECT * FROM accounts WHERE username = ?",[username], function(err, rows) {
                if (err)
                    return done(err);
                if (rows.length) {
                    return done(null, false, req.flash('signupMessage', 'That username is already taken.'));
                } else {
                    // if there is no user with that username
                    // create the user
                    var newUserMysql = {
                        username: username,
                        firstname: req.body.firstname,
                        lastname: req.body.lastname,
                        email: req.body.email,
                        password: bcrypt.hashSync(password, null, null)  // use the generateHash function in our user model
                    };

                    var insertQuery = "INSERT INTO accounts ( username, firstname, lastname, email, password ) values (?,?,?,?,?)";

                    connection.query(insertQuery,[newUserMysql.username, newUserMysql.firstname, newUserMysql.lastname, newUserMysql.email, newUserMysql.password ],function(err, rows) {
                        if(err)
                            console.log(err);
                        newUserMysql.id = rows.insertId;
                        
                        console.log("The id is " + rows.insertId);
                        return done(null, newUserMysql);
                    });
                }
            });
        })
    );

    passport.use(
        'local-login',
        new LocalStrategy({
            // by default, local strategy uses username and password, we will override with email
            usernameField : 'username',
            passwordField : 'password',
            passReqToCallback : true // allows us to pass back the entire request to the callback
        },
        function(req, username, password, done) { // callback with email and password from our form
            connection.query("SELECT * FROM accounts WHERE username = ?",[username], function(err, rows){
                if (err)
                    return done(err);
                if (!rows.length) {
                    console.log("Did not find user");
                    return done(null, false, req.flash('loginMessage', 'No user found.')); // req.flash is the way to set flashdata using connect-flash
                }

                // if the user is found but the password is wrong
                if (!bcrypt.compareSync(password, rows[0].password)) {
                    console.log("Wrong passwor");
                    return done(null, false, req.flash('loginMessage', 'Oops! Wrong password.')); // create the loginMessage and save it to session as flashdata
                }

                // all is well, return successful user
                console.log("Returning success");
                return done(null, rows[0]);
            });
        })
    );
};