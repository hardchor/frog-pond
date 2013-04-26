$(document).ready(function () {
    var socket = io.connect('http://localhost'),
        canvas = document.getElementById('pond'),
        frogs = [];

    paper.setup(canvas);

    var Point = paper.Point,
        view = paper.view,
        Rectangle = paper.Rectangle,
        Path = paper.Path,
        RgbColor = paper.RgbColor;

    /**
     * Returns a random integer between min and max
     * Using Math.round() will give you a non-uniform distribution!
     */
    function _getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function Frog(data, position) {
        var self = {},
            maxSize = 10,
            posX = position ? position.x * view.size.width : _getRandomInt(0, view.size.width),
            posY = position ? position.y * view.size.width : _getRandomInt(0, view.size.height),
            frogView = new Path.Rectangle(posX, posY, 1, 1);

        frogView.strokeColor = 'black';
        frogView.fillColor = data.gender === "m" ? new RgbColor(0, 255, 0) : new RgbColor(255, 255, 0);

        // public functions / exports
        self.id = data.id;

        self.view = frogView;

        self.destination = Point.random().multiply(view.size);

        self.update = function (data) {
            self.gender = data.gender;
            self.canMate = data.canMate;
            self.maxAge = data.maxAge;
            self.age = data.age;

            var colourModifier = Math.round(100 * self.age / self.maxAge);
            frogView.fillColor.alpha = self.maxAge / self.age;
            frogView.content = self.age;

            if (frogView.bounds.width < maxSize) {
                var scale = Math.pow(1.01, self.age);
                frogView.scale(scale);
            }
        };

        self.animate = function (e) {
            // Each frame, move the path 1/30th of the difference in position
            // between it and the destination.

            // The vector is the difference between the position of
            // the text item and the destination point:
            var vector = self.destination.subtract(frogView.position);

            // We add 1/300th of the vector to the position property
            // of the text item, to move it in the direction of the
            // destination point:
            frogView.position = frogView.position.add(vector.divide(300));

            // Set the content of the text item to be the length of the vector.
            // I.e. the distance it has to travel still:
//        frog.content = Math.round(vector.length);

            // If the distance between the path and the destination is less
            // than 5, we define a new random point in the view to move the
            // path to:
            if (vector.length < 5) {
                self.destination = Point.random().multiply(view.size);
            }
        };

        self.hitTest = function (otherFrog, tolerance) {
            tolerance = tolerance || frogView.bounds.width;

            var options = {
                tolerance: tolerance
            };

            // hit test center + tolerance
            return frogView.hitTest(otherFrog.view.position, options);
        };

        self.getPosition = function () {
            return {
                x: posX / view.size.width,
                y: posY / view.size.height
            }
        };

        self.destroy = function () {
            frogView.remove();
        };

        self.update(data);

        return self;
    }

    // create a new frog
    socket.on('frog.create', function (data, position) {
        var frog = new Frog(data, position);
        frogs.push(frog);
    });

    socket.on('frog.update', function (data) {
        $.each(frogs, function (key, frog) {
            if (frog.id == data.id) {
                frog.update(data);
            }
        });
    });

    socket.on('frog.destroy', function (id) {
        $.each(frogs, function (key, frog) {
            if (frog.id == id) {
                frog.destroy();
                frogs.splice(key, 1);
            }
        });
    });

    socket.on('disconnect', function () {
        $.each(frogs, function (key, frog) {
            frog.destroy();
        });
        frogs = [];
    });

//    var start = new paper.Point(100, 100);
//    frog.moveTo(start);

//    frog.lineTo(start.add([200, -50]));

    view.onFrame = function (e) {
        $.each(frogs, function (key, frog) {
            var otherFrogs = frogs.slice(0);
            otherFrogs.splice(key, 1);

            frog.animate(e);

            // hit test every 10 frames
            if (!(e.count % 10)) {
                $.each(otherFrogs, function (otherKey, otherFrog) {
                    if (frog.gender != otherFrog.gender && frog.canMate && otherFrog.canMate) {
                        var hitResult = frog.hitTest(otherFrog);
                        if (hitResult !== null) {
                            var newDestination = Point.random().multiply(view.size);

                            socket.emit('frog.mate', frog, otherFrog);

                            frog.destination = newDestination;
                            otherFrog.destination = newDestination;
                        }
                    }
                });

                // update position on server
                socket.emit("frog.position", frog.id, frog.getPosition());
            }
        });
    };


    // draw
    paper.view.draw();

//  var socket = io.connect();
//
//  $('#sender').bind('click', function() {
//   socket.emit('message', 'Message Sent on ' + new Date());
//  });
//
//  socket.on('server_message', function(data){
//   $('#receiver').append('<li>' + data + '</li>');
//  });


});