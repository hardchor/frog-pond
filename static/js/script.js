$(document).ready(function () {
    var socket = io.connect('http://localhost'),
        canvas = document.getElementById('pond'),
        frogs = [];

    paper.setup(canvas);

    var Point = paper.Point,
        view = paper.view,
        Rectangle = paper.Rectangle,
        Path = paper.Path;

    /**
     * Returns a random integer between min and max
     * Using Math.round() will give you a non-uniform distribution!
     */
    function _getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function Frog(data) {
        var self = {},
            frogView = new Path.Rectangle(_getRandomInt(0, view.size.width), _getRandomInt(0, view.size.height), 10, 10);

        frogView.fillColor = 'green';
        frogView.strokeColor = 'black';

        var destination = Point.random().multiply(view.size);

        // public functions / exports
        self.id = data.id;

        self.animate = function (e) {
            // Each frame, move the path 1/30th of the difference in position
            // between it and the destination.

            // The vector is the difference between the position of
            // the text item and the destination point:
            var vector = destination.subtract(frogView.position);

            // We add 1/30th of the vector to the position property
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
                destination = Point.random().multiply(view.size);
//            destination = Point.random() * view.size;
            }
        };


        return self;
    }

    // create a new frog
    socket.on('frog.create', function (data) {
        var frog = new Frog(data);
        frogs.push(frog);
    });

//    var start = new paper.Point(100, 100);
//    frog.moveTo(start);

//    frog.lineTo(start.add([200, -50]));

    view.onFrame = function (e) {
        $.each(frogs, function (key, frog) {
            frog.animate(e);
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