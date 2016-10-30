var mysql = require('mysql');
var dbconfig = require('../config/database');
var connection = mysql.createConnection(dbconfig.connection);
var nodemailer = require('nodemailer');
var async = require('async');
var crypto = require('crypto');
var sendgrid = require('sendgrid')(
  process.env.SENDGRID_API_KEY || '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'
);
var bcrypt = require('bcrypt-nodejs');


connection.connect(function(err) {
  if (err) throw err
  console.log('You are now connected again...')
})

connection.query('USE ' + dbconfig.database + ';');

module.exports = function(app, passport) {
    app.get("/", function(req, res) {
        res.render("index");
    });


    /*
    * Facebook login
    */
    app.get('/login/facebook',
        passport.authenticate('facebook'));

    app.get('/login/facebook/return',
        passport.authenticate('facebook', {
        failureRedirect: '/login'
        }),
        function(req, res) {
        res.redirect('/');
        });

    /*
    * Routes to the register page which is the account creation page
    */
    app.get("/register", function(req, res) {
        res.render('register.ejs', {
        message: req.flash('signupMessage')
        });
    });

    app.post('/register', passport.authenticate('local-signup', {
        successRedirect: '/loggedIn', // redirect to the secure profile section
        failureRedirect: '/loginFailed', // redirect back to the signup page if there is an error
        failureFlash: true // allow flash messages
    }));

    /*
    * Routes to the login page
    */
    app.get("/loggedIn", function(req, res) {
        res.render("loggedIn");
    });
  
    app.get("/loginFailed", function(req, res) {
        res.render("loginFailed");
    });

    app.post('/login', passport.authenticate('local-login', {
        successRedirect: '/logedIn', // redirect to the secure profile section
        failureRedirect: '/loginFailed', // redirect back to the signup page if there is an error
        failureFlash: true // allow flash messages
        }),
        function(req, res) {


        });
    
    /*
    * Route to Modify Profile Page
    */
    app.get('/profile', function(req, res) {
        // TODO : Get username from Session Data
        var testvar = "test";
        var user_id = 1;

        connection.query(`
            SELECT * 
            FROM profiles 
            WHERE user_id=` + user_id + ` 
            LIMIT 1;`, 
            function(err, user_info) {
                if (err || user_info.length == 0) {
                    res.redirect('/');
                } else {
                    connection.query(`
                        SELECT a.username AS sender, b.username AS receiver, c.trans_id, c.amount, c.status, DATE_FORMAT(c.time, '%m/%d/%Y %H:%i %p') AS time 
                        FROM profiles a, profiles b, transactions c, houses d
                        WHERE (c.send_id="` + user_id + `"
                        OR c.rec_id="` + user_id + `")
                        AND c.send_id=a.user_id
                        AND c.rec_id=b.user_id
                        AND c.house = FALSE
                        ORDER BY time DESC
                        LIMIT 25;`,
                        function(err, fin_trans) {
                            if (err) {
                                console.log(err);
                                res.redirect('/');
                            } else {
                                if (fin_trans.length == 0) {
                                    fin_trans = 0;
                                }
                                connection.query(`
                                    SELECT a.username, b.address1, b.address2, b.city, b.state, c.house_id
                                    FROM profiles a, houses b, house_invitations c
                                    WHERE a.user_id=c.from_id
                                    AND b.house_id=c.house_id
                                    AND c.user_id=` + user_id + `
                                    LIMIT 1;`,
                                    function(err, house_invs) {
                                        res.render("profile", {
                                            user_info:  user_info[0], 
                                            fin_trans:  fin_trans,
                                            house_invs: house_invs
                                        });
                                    });
                            }
                        });
                }
            });
    });
  
    app.post('/profile', function(req, res) {
        // TODO: Get username from Session Data
        var user_id = 1;

        var email     = req.body.email,
            firstname = req.body.firstname,
            lastname  = req.body.lastname;

        console.log("email: " + email);
            
        connection.query(`
            UPDATE profiles 
            SET email="` + email + `",
                firstname="` + firstname + `",
                lastname="` + lastname + `"
            WHERE user_id=` + user_id + `;`);
                
        res.redirect('/profile');
    });
  
    /*
    * Route to Expenses Page
    */
    // app.get('/expenses', function(req, res) {
    //     // TODO : Get username from Session Data
    //     var username = null;
    //     var result = connection.query(`SELECT username, source, expense
    //         FROM expenses
    //         WHERE username="` + username + `";`);
        
    //     res.render("expenses", result);
    // });

    /*
    *   Route to conduct transaction
    */
    app.post('/transaction', function(req, res) {
        var trans_id    = req.body.trans_id,
            accept      = req.body.accept;
        Number(trans_id);
        if (accept == "true") {
            connection.query(`
                SELECT a.balance, b.amount, b.send_id, b.rec_id
                FROM profiles a, transactions b
                WHERE b.trans_id=` + trans_id + `
                AND a.user_id=b.send_id
                LIMIT 1;`, 
                function(err, data) {
                    if (err || (data[0].balance < data[0].amount)) {
                        console.log("QUERY ERR: " + err);
                        res.redirect('/profile');
                    } else {
                        connection.query(`
                            UPDATE transactions
                            SET status=2
                            WHERE trans_id=` + trans_id + `;`);

                        console.log("Amount: " + data[0].amount);
                        
                        connection.query(`
                            UPDATE profiles
                            SET balance = (balance - ` + data[0].amount + `)
                            WHERE user_id=` + data[0].send_id + `;`,
                            function(err) {
                                if (err) {
                                    console.log("QUERY ERR: " + err);
                                    res.redirect('/profile');
                                }
                                connection.query(`
                                    UPDATE profiles
                                    SET balance = (balance + ` + data[0].amount + `)
                                    WHERE user_id=` + data[0].rec_id + `;`,
                                    function(err) {
                                        if (err) {
                                            console.log("QUERY ERR: " + err);
                                            res.redirect('/profile');
                                        }
                                        res.redirect('/profile');
                                    });
                            });
                    }
                });

        } else {
            connection.query(`
                UPDATE transactions
                SET status=3
                WHERE trans_id=` + trans_id + `;`);
        }
    });

    /* 
    * Route to house information 
    */
    app.get('/house', function(req, res) {
        // TODO: Get user_id from Session
        user_id = 1;

        connection.query(`
            SELECT username, house_id, restricted
            FROM profiles
            WHERE user_id=` + user_id + `
            LIMIT 1;`, 
            function(err, data) {
                var house_id = data[0].house_id;
                if (typeof(house_id) == "undefined" || house_id == 0 || house_id == null) {
                    res.render('house', {
                        house_id:       0,
                        house_mates:    []
                    });
                } else {
                    connection.query(`
                        SELECT user_id, firstname, lastname, email, username, restricted
                        FROM profiles
                        WHERE house_id = ` + data[0].house_id + `
                        AND user_id <> ` + user_id + `;`,
                        function(err, house_mates) {
                            if (err) {
                                res.redirect('/house');
                            }
                            connection.query(`
                                SELECT *
                                FROM houses
                                WHERE house_id = ` + data[0].house_id + `
                                LIMIT 1;`,
                                function(err, house_info) {
                                    connection.query(`
                                        SELECT b.username, a.message
                                        FROM messages a, profiles b
                                        WHERE a.house_id = ` + house_id + `
                                        AND a.user_id = b.user_id
                                        ORDER BY time DESC
                                        LIMIT 15;`,
                                        function(err, messages) {
                                            if (err) {
                                                console.log(err);
                                            }
                                            connection.query(`
                                                SELECT a.bill_id, a.freq, a.freq_type, DATE_FORMAT(a.start_date, '%j') AS start_date, a.amount, a.paid, b.name
                                                FROM bills a, service_providers b
                                                WHERE a.house_id = ` + house_id + `
                                                LIMIT 10;`, function(err, bills) {
                                                    if (err) {
                                                        console.log(err);
                                                    }

                                                    connection.query(`
                                                        SELECT c.name, d.username, a.split_id
                                                        FROM splits a, bills b, service_providers c, profiles d
                                                        WHERE a.house_id = ` + house_id + `
                                                        AND a.user_id = d.user_id
                                                        AND a.bill_id = b.bill_id
                                                        AND b.provider_id = c.provider_id
                                                        ORDER BY time DESC
                                                        LIMIT 10;`,
                                                        function(err, splits) {
                                                            if (err) {
                                                                console.log(err);
                                                            }
                                                            console.log("SPLITS: " + JSON.stringify(splits));
                                                            for (var i = 0; i < splits.length; i++) {

                                                            }
                                                            var i = 0;
                                                            splits.forEach(function(split) {
                                                                connection.query(`
                                                                    SELECT b.username, a.status, a.amount
                                                                    FROM splits_status a, profiles b
                                                                    WHERE a.split_id = ` + split.split_id + `
                                                                    AND a.user_id = b.user_id;`,
                                                                    function(err, splitters) {
                                                                        split.splitters = splitters;
                                                                        i++;
                                                                        if (i == splits.length) {
                                                                            res.render('house', {
                                                                                house_info:     house_info[0],
                                                                                house_mates:    house_mates,
                                                                                messages:       messages,
                                                                                user_id:        user_id,
                                                                                username:       data[0].username,
                                                                                bills:          bills,
                                                                                restricted:     data[0].restricted,
                                                                                splits:         splits
                                                                            });
                                                                        }
                                                                        console.log("SPLITS2: " + JSON.stringify(splits));
                                                                    });
                                                            });
                                                        });
                                                });
                                        });
                                });
                        });
                }
            });
    });

    /*
    * Route to post house information
    */
    app.post('/house', function(req, res) {
        // TODO: Get user_id and house_id from Session
        var user_id = 1,
            house_id = 1;

        if (req.body.add_house == "true") {
            var house_name  = req.body.house_name,
                address1    = req.body.address1,
                address2    = req.body.address2,
                city        = req.body.city,
                state       = req.body.state,
                zip         = req.body.zip;

            connection.query(`
                INSERT INTO houses
                VALUES (
                    NULL,
                    "` + house_name + `",
                    "` + address1 + `",
                    "` + address2 + `",
                    "` + city + `",
                    "` + state + `",
                    ` + zip + `,
                    NULL,
                    NULL,
                    NOW()
                );`, 
                function(err) {
                    if (err) {
                        console.log("err");
                        res.redirect('/house');
                    }
                    connection.query(`
                        SELECT house_id
                        FROM houses
                        WHERE address1="` + address1 + `"
                        AND address2="` + address2 + `"
                        AND city="` + city + `"
                        AND state="` + state + `"
                        AND zip=` + zip + `
                        ORDER BY time DESC
                        LIMIT 1;`, 
                        function(err, data) {
                            if (err) {
                                res.redirect('/house');
                            }
                            house_id = data[0].house_id;
                            connection.query(`
                                UPDATE profiles
                                SET house_id=` + house_id + `
                                WHERE user_id=` + user_id + `;`);

                            res.redirect('/house');
                        });
                });

        } else if (req.body.edit_house == "true") {
            var house_name  = req.body.house_name,
                address1    = req.body.address1,
                address2    = req.body.address2,
                city        = req.body.city,
                state       = req.body.state,
                zip         = req.body.zip;
            
            console.log("here2");
            connection.query(`
                UPDATE houses
                SET 
                name = "` + house_name + `",
                address1 = "` + address1 + `",
                address2 = "` + address2 + `",
                city = "` + city + `",
                state = "` + state + `",
                zip = ` + zip + `
                WHERE house_id = ` + house_id + `;`,
                function(err) {
                    if (err) {
                        console.log(err);
                    }
                    res.redirect('/house');
                });

        } else if (req.body.add_house_mate == "true") {
            var email   = req.body.email;

            connection.query(`
                SELECT user_id
                FROM profiles
                WHERE email = "` + email + `"
                AND user_id <> ` + user_id + `
                LIMIT 1;`,
                function(err, data) {
                    console.log("DATA: " + JSON.stringify(data));
                    if (err) {
                        res.redirect('/house');
                    }
                    if (data.length == 0) {
                        console.log("User doesn't exist");
                    }
                    connection.query(`
                        SELECT *
                        FROM house_invitations
                        WHERE house_id=` + house_id + `
                        AND user_id=` + data[0].user_id + `
                        LIMIT 1;`,
                        function(err, invs) {
                            if (err) {
                                res.redirect('/house');
                            }
                            if (invs.length == 0) {
                                connection.query(`
                                    INSERT INTO house_invitations
                                    VALUES (
                                        ` + house_id +`,
                                        ` + data[0].user_id + `
                                    );`,
                                    function(err) {
                                        console.log("here");
                                        res.redirect('/house');
                                    });
                            } else {
                                res.redirect('/house');
                            }
                        });
                });

        } else if (req.body.inv_resp == "true") {
            console.log("resp");
            var inv_house_id = req.body.house_id;

            if (req.body.accept == "true") {
                connection.query(`
                    UPDATE profiles
                    SET house_id = ` + inv_house_id + `
                    WHERE user_id = ` + user_id + `;`,
                    function(err) {
                        if (err) {
                            res.redirect('/profile');
                        }
                        connection.query(`DELETE FROM house_invitations
                            WHERE user_id = ` + user_id + `
                            AND house_id = ` + inv_house_id + `;`,
                            function(err) {
                                res.redirect('/house');
                            });
                    });
            } else {
                connection.query(`
                    DELETE FROM house_invitations
                    WHERE user_id = ` + user_id + `
                    AND house_id = ` + inv_house_id + `;`,
                    function(err) {
                        res.redirect('/profile');
                    });
            }

        } else if (req.body.send_request == "true") {
            var send_req    = req.body.send_req,
                other_user  = req.body.other_user,
                amount      = req.body.amount;

            if (send_req == "req") {
                if (other_user == "house") {
                    connection.query(`
                        INSERT INTO transactions
                        VALUES (
                            NULL,
                            NOW(),
                            ` + house_id + `, 
                            ` + user_id + `,
                            ` + amount + `,
                            2,
                            TRUE
                        )`,
                        function(err) {
                            connection.query(`
                                UPDATE profiles a, houses b 
                                SET 
                                    a.balance = IF(b.balance >= ` + amount + `, a.balance + ` + amount + `, a.balance),
                                    b.balance = IF(b.balance >= ` + amount + `, b.balance - ` + amount + `, b.balance)
                                WHERE a.user_id = ` + user_id + `
                                AND b.house_id = ` + house_id + `;`,
                                function(err) {
                                    if (err) {
                                        console.log(err);
                                    }
                                    res.redirect('/house');
                                });
                        });
                } else {
                    connection.query(`
                        INSERT INTO transactions
                        VALUES (
                            NULL,
                            NOW(),
                            ` + other_user + `,
                            ` + user_id + `,
                            ` + amount + `,
                            0,
                            FALSE
                        );`,
                        function(err) {
                            res.redirect('/profile');
                        });
                }
            } else {
                if (other_user == "house") {
                    connection.query(`
                        INSERT INTO transactions
                        VALUES (
                            NULL,
                            NOW(),
                            ` + user_id + `, 
                            ` + house_id + `,
                            ` + amount + `,
                            2,
                            TRUE
                        )`,
                        function(err) {
                            connection.query(`
                                UPDATE profiles a, houses b 
                                SET 
                                    a.balance = IF(a.balance >= ` + amount + `, a.balance - ` + amount + `, a.balance),
                                    b.balance = IF(a.balance >= ` + amount + `, b.balance + ` + amount + `, b.balance)
                                WHERE a.user_id = ` + user_id + `
                                AND b.house_id = ` + house_id + `;`,
                                function(err) {
                                    if (err) {
                                        console.log(err);
                                    }
                                    res.redirect('/house');
                                });
                        });
                } else {
                    connection.query(`
                        INSERT INTO transactions
                        VALUES (
                            NULL,
                            NOW(),
                            ` + user_id + `,
                            ` + other_user + `,
                            ` + amount + `,
                            1,
                            FALSE
                        );`,
                        function(err) {
                            res.redirect('/profile');
                        });
                }
            }
        } else if (req.body.remove_mate == "true") {
            var mate_id = req.body.user_id;

            connection.query(`
                UPDATE profiles
                SET house_id = NULL
                WHERE user_id = ` + mate_id + `;`,
                function(err) {
                    res.redirect('/house');
                });
        } else if (req.body.restrict == "true") {
            var mate_id     = req.body.user_id,
                restrict    = req.body.rest;

            console.log("RESTRICT: " + restrict);

            if (restrict == "true") {
                console.log("true");
                connection.query(`
                    UPDATE profiles
                    SET restricted = TRUE
                    WHERE user_id = ` + mate_id + `;`,
                    function(err) {
                        if (err) {
                            console.log(err);
                        }
                        res.redirect('/house');
                    });
            } else {
                console.log("false");
                connection.query(`
                    UPDATE profiles
                    SET restricted = FALSE
                    WHERE user_id = ` + mate_id + `;`,
                    function(err) {
                        if (err) {
                            console.log(err);
                        }
                        res.redirect('/house');
                    });
            }

        } else if (req.body.send_message == "true") {
            console.log("messages");
            var message    = req.body.message;

            connection.query(`
                INSERT INTO messages
                VALUES (
                    NOW(),
                    ` + house_id + `,
                    ` + user_id + `,
                    "` + message + `"
                );`,
                function(err) {
                    console.log(err);
                    res.redirect('/house');
                });

        } else if (req.body.pay_bill == "true") {
            var bill_id = req.body.bill_id,
                paid = req.body.paid;

            connection.query(`
                SELECT *
                FROM bills
                WHERE bill_id = ` + bill_id + `
                LIMIT 1;`, 
                function(err, bill) {
                    if (err) {
                        console.log(err);
                    }
                    connection.query(`
                        UPDATE houses a, service_providers b, bills c
                        SET
                            a.balance = IF(a.balance >= ` + bill[0].amount + `, a.balance - ` + bill[0].amount + `, a.balance),
                            b.balance = IF(a.balance >= ` + bill[0].amount + `, b.balance + ` + bill[0].amount + `, b.balance),
                            c.paid = IF(a.balance >= ` + bill[0].amount + `, ` + paid + `, c.paid)
                        WHERE a.house_id = ` + house_id + `
                        AND b.provider_id = c.provider_id
                        AND a.house_id = c.house_id;`,
                        function(err) {
                            if (err) {
                                console.log(err);
                            }
                            res.redirect('/house');
                        });
                });
        } else if (req.body.create_split == "true") {
            var splits = JSON.parse(req.body.splits),
                bill_id = req.body.bill_id;

            connection.query(`
                INSERT INTO splits
                VALUES (
                    NULL,
                    ` + house_id + `,
                    ` + bill_id + `,
                    ` + user_id + `,
                    NOW()
                );`, 
                function(err) {
                    if (err) {
                        console.log(err);
                    }
                    connection.query(`
                        SELECT split_id
                        FROM splits
                        WHERE house_id = ` + house_id + `
                        AND bill_id = ` + bill_id + `
                        ORDER BY time DESC
                        LIMIT 1;`, 
                        function(err, split_id) {
                            if (err) {
                                console.log(err);
                            }
                            splits.forEach(function(split) {
                                connection.query(`
                                    INSERT INTO splits_status
                                    VALUES (
                                        ` + split_id[0].split_id + `,
                                        ` + split.user_id + `,
                                        0,
                                        ` + split.amount + `
                                    );`,
                                    function(err) {
                                        if (err) {
                                            console.log(err);
                                        }
                                    });
                            }, res.redirect('/house'));
                        });
                });

        } else if (req.body.pay_split == "true") {
            var split_id = req.body.split_id;

            connection.query(`
                UPDATE service_providers a, profiles b, splits_status c, splits d, bills e
                SET
                    a.balance = IF(b.balance >= c.amount, a.balance + c.amount, a.balance),
                    b.balance = IF(b.balance >= c.amount, b.balance - c.amount, b.balance),
                    c.status = IF(b.balance >= c.amount, 1, c.status)
                WHERE d.split_id = c.split_id
                AND c.user_id = b.user_id
                AND c.user_id =` + user_id + `
                AND d.bill_id = e.bill_id
                AND e.provider_id = a.provider_id;`,
                function(err) {
                    if (err) {
                        console.log(err);
                    }
                    res.redirect('/house');
                });


        } else if (req.body.decline_split == "true") {
            var split_id = req.body.split_id;

            connection.query(`
                UPDATE splits_status
                SET status = 2
                WHERE split_id = ` + split_id + `
                AND user_id = ` + user_id + `;`,
                function(err) {
                    if (err) {
                        console.log(err);
                    }
                    res.redirect('/house');
                });

        }
    });

    /* Service provider route */
    app.get('/service', function(req, res) {
        // TODO get provider id from session data
        var provider_id = 1;

        connection.query(`
            SELECT *
            FROM service_providers
            WHERE provider_id = ` + provider_id + `
            LIMIT 1;`,
            function(err, provider) {
                if (err) {
                    console.log(err);
                }
                connection.query(`
                    SELECT a.address1, a.address2, a.city, a.state, b.start_date, b.freq, b.freq_type, b.amount
                    FROM houses a, bills b
                    WHERE provider_id = ` + provider_id + `
                    ORDER BY bill_id DESC
                    LIMIT 100;`, function(err, bills) {
                        if (err) {
                            console.log(err);
                        }
                        res.render('service', {
                            provider_info:  provider[0],
                            bills:          bills
                        });
                    });
            });
    });

    /* Service provider post route */
    app.post('/service', function(req, res) {
        // TODO get provider id from session data
        var provider_id = 1;

        if (req.body.add_bill == "true") {
            var address1    = req.body.address1,
                address2    = req.body.address2,
                city        = req.body.city,
                state       = req.body.state,
                zip         = req.body.zip;

            connection.query(`
                SELECT house_id
                FROM houses
                WHERE address1 = "` + address1 + `"
                AND address2 = "` + address2 + `"
                AND city = "` + city + `"
                AND state = "` + state + `"
                AND zip = ` + zip + `
                LIMIT 1;`, function(err, house_id) {
                    if (err || house_id.length < 1) {
                        res.redirect('/service');
                    }
                    var day         = req.body.day,
                        month       = req.body.month,
                        year        = req.body.year,
                        freq        = req.body.freq,
                        freq_type   = req.body.freq_type;

                    connection.query(`
                        INSERT INTO bills
                        VALUES (
                            NULL,
                            ` + house_id[0].house_id + `,
                            ` + provider_id + `,
                            STR_TO_DATE('` + year + `-` + month + `-` + day + `', '%Y-%m-%d'),
                            ` + freq + `,
                            "` + freq_type + `"
                        );`,
                        function(err) {
                            if (err) {
                                console.log(err);
                            }
                            res.redirect('/service');
                        });
                });
        }
    });
}

function isLoggedIn(req, res, next) {
    if (req.isAuthenticated())
        return next();
    console.log("I was executed");
    // res.redirect('/login');
}