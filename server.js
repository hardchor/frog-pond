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
    maxFrogs = 20;

/**
 * Returns a random integer between min and max
 * Using Math.round() will give you a non-uniform distribution!
 */
function _getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function Frog() {
    var self = {};

    self.id = _getRandomInt(1, 10000);
    self.gender = !!_getRandomInt(0, 1) ? 'm' : 'f';
    self.canMate = false;
    self.maxAge = 100;
    self.age = 0;

    self.position = {
        x: 0,
        y: 0
    };

    self.tick = function () {
        self.age++;
        self.canMate = self.age < (self.maxAge * 0.8) && self.age > (self.maxAge * 0.2);
    };

    return self;
}

var FrogFactory = {
    create: function () {
        var frog = new Frog();
        frogs.push(frog);

        return frog;
    },
    mate:   function (firstFrog, secondFrog) {
        if (firstFrog.canMate && secondFrog.canMate) {
            console.log('MATING', firstFrog.id, secondFrog.id);
            var frog = new Frog();
            frogs.push(frog);

            firstFrog.canMate = false;
            secondFrog.canMate = false;

            // cooldown period
            setTimeout(function () {
                console.log('MATING OVER');
                firstFrog.canMate = true;
                secondFrog.canMate = true;
            }, 5000);

            return frog;
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

io.sockets.on('connection', function (socket) {
    console.log('Client Connected');

    tick = setInterval(function () {
        if (frogs.length <= maxFrogs) {
            var frog = FrogFactory.create();

            socket.emit('frog.create', frog);
        }

        _.each(frogs, function (frog, key) {
            frog.tick();
            socket.emit('frog.update', frog);

            if (frog.age >= frog.maxAge) {
                socket.emit('frog.destroy', frog);
                frogs.splice(key, 1);
            }
        });
    }, 1000);

    socket.on('frog.mate', function (firstFrog, secondFrog) {
        firstFrog = FrogFactory.get(firstFrog.id);
        secondFrog = FrogFactory.get(secondFrog.id);

        FrogFactory.mate(firstFrog, secondFrog);
    });

    socket.on('frog.position', function (id, position) {
        frog = FrogFactory.get(id);
        frog.position = position;
    });

    socket.on('disconnect', function () {
        clearInterval(tick);

        frogs = [];
        frogs.length = 0;

        console.log('Client Disconnected.');
    });
});


///////////////////////////////////////////
//              Routes                   //
///////////////////////////////////////////

/////// ADD ALL YOUR ROUTES HERE  /////////

server.get('/', function (req, res) {
    res.render('index.jade', {
        locals: {
            title: 'Your Page Title', description: 'Your Page Description', author: 'Your Name', analyticssiteid: 'XXXXXXX'
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
