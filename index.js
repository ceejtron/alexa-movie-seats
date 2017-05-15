const Alexa = require('alexa-sdk');
const https = require('https');
const moment = require('moment-timezone');
const market = '0000'; // Hardcoded to Austin for now
const drafthouseUrl = `https://feeds.drafthouse.com/adcService/showtimes.svc/market/${market}/`;
const defaultTheater = 'Lakeline';

exports.handler = function(event, context){
    const alexa = Alexa.handler(event, context);
    alexa.registerHandlers(handlers);
    alexa.execute();
};

const handlers = {
    'SearchForSeats': findSeats,
    'QuerySeats': querySeats
};

function findSeats () {
    const slots = this.event.request.intent.slots;
    const movieName = slots['movie.name'].value;
    const movieDate = slots['movie.date'].value;
    const movieTheater = slots['movie.theater'].value || defaultTheater;
    const movieShowtime = slots['movie.showtime'].value;
    const seatsAvailable = slots['movie.seats_available'].value || 10;

    fetchShowtimes().then((data) => {
        const filteredData = filterShowtimes(data, movieName, movieDate, movieTheater, movieShowtime, seatsAvailable);
        const outputText = outputFindResults(filteredData);
        this.emit(':tell', outputText);
    }).catch(e => this.emit(':tell', `Something went wrong: ${e}`));
}

function querySeats () {
    const slots = this.event.request.intent.slots;
    const movieName = slots['movie.name'].value;
    const movieDate = slots['movie.date'].value;
    const movieTheater = slots['movie.theater'].value || defaultTheater;
    const movieShowtime = slots['movie.showtime'].value;

    fetchShowtimes().then((data) => {
        const filteredData = filterShowtimes(data, movieName, movieDate, movieTheater, movieShowtime);
        const outputText = outputQueryResults(filteredData);
        this.emit(':tell', outputText);
    }).catch(e => this.emit(':tell', `Something went wrong: ${e}`));
}

function outputFindResults (results) {
    if (!results.showtimeCount) {
        return 'There are no seats available that meet that criteria.';
    }
    return results.data.map((date) => {
        return `For ${date.FormattedDate}, ` + date.Cinemas.map((c) => {
            return `the ${c.CinemaName} cinema ` + c.Films.map((f) => {
                return `showing of ${f.FilmName} has seats available for the ` + f.ShowTimes.map((st, i) => {
                    if (f.ShowTimes.length > 1 && i === f.ShowTimes.length - 1) {
                        return `and ${st.time}`;
                    }
                    return st.time;
                }).join(', ') + (f.ShowTimes.length > 1 ? ' showtimes' : ' showtime');
            }).join('. ');
        }).join('. ');
    }).join('. ');
}

function outputQueryResults (results) {
    if (!results.showtimeCount) {
        return 'There are no available showtimes meeting that criteria.';
    }
    return results.data.map((date) => {
        return `For ${date.FormattedDate}, ` + date.Cinemas.map((c) => {
            return `the ${c.CinemaName} cinema ` + c.Films.map((f) => {
                return `showing of ${f.FilmName} has ` + f.ShowTimes.map((st) => {
                    return `${st.seats} ${st.seats == 1 ? 'seat' : 'seats'} at ${st.time}`;
                }).join(', ')
            }).join('. ');
        }).join('. ');
    }).join('. ');
}

function filterShowtimes (showtimeData, movieName, movieDate, movieTheater, movieShowtime, seatsAvailable) {
    const timeZone = showtimeData.Market.Dates[0].Cinemas[0].CinemaTimeZoneATE;
    movieDate = movieDate || moment().tz(timeZone).format();
    const {startDate, endDate} = getDateFromSlot(movieDate, timeZone);
    const seatFilter = seatsAvailable ? parseInt(seatsAvailable) : null;
    let showtimeCount = 0;

    if (movieTheater === 'all theaters') {
        movieTheater = null;
    }

    // Date Filter
    return {
        data: showtimeData.Market.Dates.filter((d) => {
            const mDate = moment.tz(d.DateId, timeZone).hour(0).minute(0).second(0);
            const dateMatch = mDate.isSameOrAfter(startDate) && mDate.isSameOrBefore(endDate);

            if (!dateMatch) {
                return false;
            }
            d.FormattedDate = mDate.format('dddd MMMM Do');
            // Theater Filter
            d.Cinemas = d.Cinemas.filter((c) => {
                if (movieTheater && !c.CinemaName.match(new RegExp(movieTheater.replace(' ', '\\s*'), 'i'))) {
                    return false;
                }
                // Movie Filter
                c.Films = c.Films.filter((f) => {
                    if (movieName && !f.FilmName.match(new RegExp(movieName.replace(' ', '\\s*'), 'i'))) {
                        return false;
                    }
                    // Showtime & Seat Filter
                    f.ShowTimes = f.Series[0].Formats[0].Sessions.map((st) => {
                        if (movieShowtime && movieShowtime !== st.SessionDateTime) {
                            return null;
                        }
                        if (seatFilter && parseInt(st.SeatsLeft) < seatFilter) {
                            return null;
                        }
                        showtimeCount++;
                        return {
                            time: moment(st.SessionDateTime).format('LT'),
                            seats: st.SeatsLeft
                        };
                    }).filter(Boolean);

                    return f.ShowTimes.length;
                });

                return c.Films.length;
            });

            return d.Cinemas.length;
        }),
        showtimeCount
    }
}

function fetchShowtimes () {
    return new Promise ((resolve, reject) => {
        https.get(drafthouseUrl, (res) => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => resolve(JSON.parse(data)));
            res.on('error', reject);
        });
    });
}

function getDateFromSlot(rawDate, timeZone) {
    // try to parse data
    const date = new Date(Date.parse(rawDate));
    let result;
    // create an empty object to use later
    const eventDate = {

    };

    // if could not parse data must be one of the other formats
    if (isNaN(date)) {
        // to find out what type of date this is, we can split it and count how many parts we have see comments above.
        const res = rawDate.split("-");
        // if we have 2 bits that include a 'W' week number
        if (res.length === 2 && res[1].indexOf('W') > -1) {
            const dates = getWeekData(res);
            eventDate["startDate"] = moment.tz(dates.startDate, timeZone);
            eventDate["endDate"] = moment.tz(dates.endDate, timeZone);
            // if we have 3 bits, we could either have a valid date (which would have parsed already) or a weekend
        } else if (res.length === 3) {
            const dates = getWeekendData(res);
            eventDate["startDate"] = moment.tz(dates.startDate, timeZone);
            eventDate["endDate"] = moment.tz(dates.endDate, timeZone);
            // anything else would be out of range for this skill
        } else {
            eventDate["error"] = dateOutOfRange;
        }
        // original slot value was parsed correctly
    } else {
        eventDate.startDate = moment.tz(rawDate, timeZone);
        eventDate.endDate = moment.tz(rawDate, timeZone);
    }
    eventDate.startDate = eventDate.startDate.hour(0).minute(0).second(0);
    eventDate.endDate = eventDate.endDate.hour(23).minute(59).second(59);
    return eventDate;
}

// Given a week number return the dates for both weekend days
function getWeekendData(res) {
    if (res.length === 3) {
        const saturdayIndex = 5;
        const sundayIndex = 6;
        const weekNumber = res[1].substring(1);

        const weekStart = w2date(res[0], weekNumber, saturdayIndex);
        const weekEnd = w2date(res[0], weekNumber, sundayIndex);

        return Dates = {
            startDate: moment(weekStart).format('YYYY-MM-DD'),
            endDate: moment(weekEnd).format('YYYY-MM-DD')
        };
    }
}

// Given a week number return the dates for both the start date and the end date
function getWeekData(res) {
    if (res.length === 2) {

        const mondayIndex = 0;
        const sundayIndex = 6;

        const weekNumber = res[1].substring(1);

        const weekStart = w2date(res[0], weekNumber, mondayIndex);
        const weekEnd = w2date(res[0], weekNumber, sundayIndex);

        return Dates = {
            startDate: moment(weekStart).format('YYYY-MM-DD'),
            endDate: moment(weekEnd).format('YYYY-MM-DD')
        };
    }
}

// Used to work out the dates given week numbers
function w2date (year, wn, dayNb) {
    const day = 86400000;

    const j10 = new Date(year, 0, 10, 12, 0, 0),
        j4 = new Date(year, 0, 4, 12, 0, 0),
        mon1 = j4.getTime() - j10.getDay() * day;
    return new Date(mon1 + ((wn - 1) * 7 + dayNb) * day);
}

exports.fetchShowtimes = fetchShowtimes;
exports.filterShowtimes = filterShowtimes;
exports.getDateFromSlot = getDateFromSlot;
exports.outputFindResults = outputFindResults;
exports.outputQueryResults = outputQueryResults;