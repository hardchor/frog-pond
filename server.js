//setup Dependencies
var connect = require('connect')
    , express = require('express')
    , io = require('socket.io')
    , _ = require('underscore')
    , port = (process.env.PORT || 8081);

//Setup Express
var server = express.createServer();
server.configure(function () {
    server.set('views', __dirname + '/views');
    server.set('view options', { layout: false });
    server.use(connect.bodyParser());
    server.use(express.cookieParser());
    server.use(express.session({ secret: "shhhhhhhhh!"}));
    server.use(connect.static(__dirname + '/static'));
    server.use(server.router);
});

//setup the errors
server.error(function (err, req, res, next) {
    if (err instanceof NotFound) {
        res.render('404.jade', { locals: {
            title: '404 - Not Found', description: '', author: '', analyticssiteid: 'XXXXXXX'
        }, status:                       404 });
    }
    else {
        res.render('500.jade', { locals: {
            title: 'The Server Encountered an Error', description: '', author: '', analyticssiteid: 'XXXXXXX', error: err
        }, status:                       500 });
    }
});
server.listen(port);

var frogs = [],
    maxFrogs = 20,
    socket,
    algae = 100,
    oxygen = 100,
    nitrogen = 10000;

/**
 * Returns a random integer between min and max
 * Using Math.round() will give you a non-uniform distribution!
 */
function _getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function Frog(position) {
    var self = {};

    self.id = _getRandomInt(1, 10000);
    self.gender = !!_getRandomInt(0, 1) ? 'm' : 'f';
    self.canMate = false;
    self.maxAge = 100;
    self.age = 0;

    self.position = position || {
        x: 0,
        y: 0
    };

    self.tick = function () {
        self.age++;
        self.canMate = self.age < (self.maxAge * 0.8) && self.age > (self.maxAge * 0.2);

        // eat!
        // @todo model consumption (based on algae level), health (based on consumption, age)
        algae--;
    };

    return self;
}

var FrogFactory = {
    create: function (position) {
        var frog = new Frog(position);
        frogs.push(frog);
        socket.emit('frog.create', frog);

        return frog;
    },
    mate:   function (firstFrog, secondFrog) {
        if (firstFrog.canMate && secondFrog.canMate) {
            var frog = FrogFactory.create(firstFrog.position);

            firstFrog.canMate = false;
            secondFrog.canMate = false;

            socket.emit('frog.update', firstFrog);
            socket.emit('frog.update', secondFrog);

            // "cooldown" period
            setTimeout(function () {
                firstFrog.canMate = true;
                secondFrog.canMate = true;

                socket.emit('frog.update', firstFrog);
                socket.emit('frog.update', secondFrog);
            }, 10000);
        }
    },
    get:    function (id) {
        var returnFrog;

        _.each(frogs, function (frog) {
            if (id === frog.id) {
                returnFrog = frog;
            }
        });

        return returnFrog;
    }
};

//Setup Socket.IO
var io = io.listen(server);

var tick;

io.sockets.on('connection', function (websocket) {
    socket = websocket;
    console.log('Client Connected');

    // initial population
    for (var i = 0; i < maxFrogs; i++) {
        FrogFactory.create();
    }
    tick = setInterval(function () {
        /**
         * 1 algae transforms 1 nitrogen into 1 oxygen
         */
        var growth = Math.max(0.9, Math.min(nitrogen / algae, 1.5));
        algae = Math.round(algae * growth);

        var consumption = algae < nitrogen ? algae : nitrogen;

        nitrogen = nitrogen - consumption;
        oxygen = oxygen + consumption;

        _.each(frogs, function (frog, key) {
            frog.tick();
            socket.emit('frog.update', frog);

            if (frog.age >= frog.maxAge) {
                socket.emit('frog.destroy', frog.id);
                frogs.splice(key, 1);

                nitrogen += 100;
            }
        });

        socket.emit("frogs.stats", {
            num: frogs.length
        });

        socket.emit("algae.stats", {
            num: algae
        });

        // oxygen not needed atm (frogs, not fish ;) ) - keep for later
        socket.emit("oxygen.stats", {
            num: oxygen
        });

        socket.emit("nitrogen.stats", {
            num: nitrogen
        });
    }, 1000);

    socket.on('frog.mate', function (firstFrog, secondFrog) {
        firstFrog = FrogFactory.get(firstFrog.id);
        secondFrog = FrogFactory.get(secondFrog.id);

        FrogFactory.mate(firstFrog, secondFrog);
    });

    socket.on('frog.position', function (frog, position) {
        serverFrog = FrogFactory.get(frog.id);

        if (serverFrog) {
            serverFrog.position = position;
        }
        else {
            // client has out of date information
            socket.emit('frog.destroy', frog.id);
        }
    });

    socket.on('disconnect', function () {
        clearInterval(tick);

        frogs = [];
        frogs.length = 0;
        algae = 100;
        oxygen = 100;
        nitrogen = 10000;

        console.log('Client Disconnected.');
    });
});

// @todo manage food resources
// @todo simulate speed, strength, max age etc.


///////////////////////////////////////////
//              Routes                   //
///////////////////////////////////////////

/////// ADD ALL YOUR ROUTES HERE  /////////

server.get('/', function (req, res) {
    res.render('index.jade', {
        locals: {
            title: 'Frogs!', description: 'The ultimate frog simulator', author: 'Burkhard Reffeling', analyticssiteid: 'XXXXXXX'
        }
    });
});


//A Route for Creating a 500 Error (Useful to keep around)
server.get('/500', function (req, res) {
    throw new Error('This is a 500 Error');
});

//The 404 Route (ALWAYS Keep this as the last route)
server.get('/*', function (req, res) {
    throw new NotFound;
});

function NotFound(msg) {
    this.name = 'NotFound';
    Error.call(this, msg);
    Error.captureStackTrace(this, arguments.callee);
}


console.log('Listening on http://0.0.0.0:' + port);
