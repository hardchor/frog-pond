$(document).ready(function () {
    var socket = io.connect('http://localhost'),
        canvas = document.getElementById('pond'),
        frogs = [],
        algae = [];

    paper.setup(canvas);

    var Point = paper.Point,
        view = paper.view,
        Path = paper.Path,
        RgbColor = paper.RgbColor,
        Layer = paper.Layer;

    var AlgaeLayer = new Layer(),
        FrogLayer = new Layer();

    /**
     * Returns a random integer between min and max
     * Using Math.round() will give you a non-uniform distribution!
     */
    function _getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function Frog(data) {
        var self = {},
            maxSize = 10,
            posX = data.position.x ? Math.round(data.position.x * view.size.width) : _getRandomInt(0, view.size.width),
            posY = data.position.y ? Math.round(data.position.y * view.size.width) : _getRandomInt(0, view.size.height),
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

            frogView.strokeColor = self.canMate ? 'red' : 'black';

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
            frogView.position = frogView.position.add(vector.divide(100));

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

        self.newDestination = function () {
            self.destination = Point.random().multiply(view.size)
        };

        self.destroy = function () {
            frogView.remove();
        };

        self.update(data);

        FrogLayer.addChild(frogView);

        return self;
    }

    function Alga() {
        var self = {},
            posX = _getRandomInt(0, view.size.width),
            posY = _getRandomInt(0, view.size.height),
            algaView = new Path.Rectangle(posX, posY, 10, 10);

        algaView.fillColor = "#A5FFA9";
        algaView.smooth();

        self.destroy = function() {
            algaView.remove();
        };

        AlgaeLayer.addChild(algaView);

        return self;
    }

    // create a new frog
    socket.on('frog.create', function (data) {
        var frog = new Frog(data);
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

                return false;
            }
        });
    });

    socket.on('disconnect', function () {
        $.each(frogs, function (key, frog) {
            frog.destroy();
        });
        frogs = [];
    });

    socket.on('frogs.stats', function (data) {
        $('.frogNum').find('strong').text(data.num);
    });

    socket.on('algae.stats', function (data) {
        $('.algaeNum').find('strong').text(data.num);

        while(algae.length < data.num) {
            algae.push(new Alga());
        }
        while(algae.length > data.num) {
            var alga = algae.shift();
            alga.destroy();
        }
    });

    socket.on('oxygen.stats', function (data) {
        $('.oxygenNum').find('strong').text(data.num);
    });

    socket.on('nitrogen.stats', function (data) {
        $('.nitrogenNum').find('strong').text(data.num);
    });

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

                            // depart
                            frog.newDestination();
                            otherFrog.newDestination();
                        }
                    }
                });

                // update position on server
                socket.emit("frog.position", frog, frog.getPosition());
            }
        });
    };


    // draw
    view.draw();

});