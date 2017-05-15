const lib = require('./index');
const fs = require('fs');
exports.testSeats = function testSeats () {
    lib.fetchShowtimes().then((data) => {
        const movieName = 'guardians of the galaxy';
        const movieDate = '2017-05-14';
        const movieTheater = 'Lakeline';
        const movieShowtime = null;
        const filteredData = lib.filterShowtimes(
            data,
            movieName,
            movieDate,
            movieTheater,
            movieShowtime
        );
        const outputText = lib.outputQueryResults(filteredData);
        console.log(outputText);
    }).catch(e => console.error(e));
};

exports.testFind = function find() {
    lib.fetchShowtimes().then((data) => {
        const movieName = 'alien';
        const movieDate = '2017-05-18';
        const movieTheater = 'Lakeline';
        const movieShowtime = null;
        const seatCount = 10;
        const filteredData = lib.filterShowtimes(
            data,
            movieName,
            movieDate,
            movieTheater,
            movieShowtime,
            seatCount
        );
        fs.writeFileSync('output.json', JSON.stringify(filteredData, null, 4));
        const outputText = lib.outputFindResults(filteredData);
        console.log(outputText);
    });
};
