// globally shared state and data objects
import {state, yaml} from "./main.js";


// shorthand functions that imitate jQuery-like behaviours (selector lookup, property checking, etc.)
const $ = (s, o = document) => o.querySelector(s);
const $$ = (s, o = document) => o.querySelectorAll(s);
const $hasProp = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const $typeOf = (v) => Object.prototype.toString.call(v).replace("[object ", "").replace("]", "");

// a "spare" HTML element (never part of displayed contents) used as a helper for functions below
const $htmlHelper = document.createElement("p");

// CIDRmasks is an array of longint representations of all possible CIDR net masks (except for /32)
const CIDRmasks = [...Array(32).keys()].map(bits => ~(0xFFFFFFFF >>> bits) >>> 0);
const cidr2long = (suffix) => (suffix > 0 && suffix < 32) ? CIDRmasks[suffix] : 0xFFFFFFFF;


// triggers the routine to completely redraw the table with a different view (i.e. some columns hidden)
function updateView(view) {
    saveState({view: view});
    document.dispatchEvent(new Event("updateView"));
}


// update URL with current state coming from the 'state' object
// normally should be called only when page really changes the view that reflects new state of things
// 'state' keys that start with underscore or keys with empty string values will not propagate to the URL
function saveState(newState, replace = false) {

    // extend current state object with the updated information
    Object.assign(state, newState || {});

    // clear state keys where value has been set to 'undefined'
    Object.keys(newState || {}).filter(key => $typeOf(state[key]) === "Undefined").forEach(key => delete state[key]);

    // construct new URL hash
    const hash = Object.keys(state)
        .filter(key => $typeOf(state[key]) === "String" && state[key] !== "" && !key.startsWith("_"))
        .map(key => key + "=" + encodeURIComponent(state[key])).join("&");

    // store new URL in browser history (i.e., "navigate to new fake URL") if the hash really changed
    if (document.location.hash.substring(1) !== hash) {
        if (replace) {
            history.replaceState(null, $("title").textContent, hash ? ("#" + hash) : ".");
        } else {
            history.pushState(null, $("title").textContent, hash ? ("#" + hash) : ".");
        }
    }
}


// converts a string into another string that is safe to inject into HTML attributes' values
function escapeHtml(html) {
    $htmlHelper.textContent = html;
    return $htmlHelper.innerHTML;
}


// converts HTML text string into a pure text that would be visible in a browser (stripping tags, etc.)
function html2text(html) {
    $htmlHelper.innerHTML = html;
    return $htmlHelper.textContent;
}


// converts given property of the object into array, if it's not already array
function value2array(obj, prop) {
    if (!Array.isArray(obj[prop])) {
        if ($typeOf(obj[prop]) === "String" && obj[prop].length) {
            obj[prop] = [obj[prop]];
        } else {
            obj[prop] = [];
        }
    }
}


// converts an IPv4 address (string) into an integer that represents the same IP address as 'longint'
function ip2long(ip) {
    const octet = String(ip).split(".");
    return octet.length === 4
        ? ((((((+octet[0]) * 256) + (+octet[1])) * 256) + (+octet[2])) * 256) + (+octet[3])
        : 0;
}


// converts version string x.x.x.x.x.x-blah-x into a special hash that can be used for string comparison
// some strong assumptions here: single 'x' can be alphanumeric but will be truncated/padded to 6 chars
// 'blah' is optional, something like 'release', 'rc', 'beta', etc., and will be truncated to 2 chars
// the digit and dash after 'blah' is also optional, truncated to 6 chars
// padding character will be either space or ~ (below all alphanumeric or above) accordingly:
// 1.2.?.9876543.omg.9-bUiLd-7 becomes:  "     1     2     ?987654   omg     9bu     7"
// 1.13.7 becomes:                       "     1    13     7                  ~~      "
// 1.13.7-rc12 becomes:                  "     1    13     7                  rc    12"
// 1.13.7-a-z3 becomes:                  "     1    13     7                  a~    z3"
function version2hash(ver) {
    // how many dot separated groups of characters to consider (before optional dash)
    const groups = 6;
    // max amount of characters for each of the dot separated groups (will be cut or padded to this amount)
    const padNum = 6;
    // max amount of characters for the string after optional dash (like -release, -beta, etc.)
    const padAlph = 2;

    // padding characters for dotted groups and string after optional dash
    const padChrLo = " ";
    const padChrHi = "~";

    // set maximum lengths of final hash parts using parameters above
    const hl = groups * padNum;
    const hlExt = hl + padAlph;
    const hlFull = hlExt + padNum;

    // start with empty values that will change and grow over time
    let hash = "";
    let group = "";
    let char = "";

    // if the version string is empty or non-existent, immediately return 'empty' hash
    if (!ver) {
        return padChrLo.repeat(hl) + padChrHi.repeat(padAlph) + padChrLo.repeat(padNum);
    }

    // 'for' loops are bad, but the 'for..of' is tolerated as a performance optimisation
    // we iterate over each character of the original version string here
    // (note that unlike all other possible for() and forEach iterators that could be used,
    // the for..of loop actually takes care of UTF* encoding and multibyte characters!)
    for (char of String(ver)) {

        // if we have not yet reached main hash length (before dash), do these steps
        if (hash.length < hl) {

            // if we reached a dot character, add new group to the hash
            if (char === ".") {
                // cut and pad current group as required
                hash += group.substring(0, padNum).padStart(padNum, padChrLo);
                // reset group for next possible iteration after dot
                group = "";

            // if we reached a dash character, it means we should finalize main hash
            } else if (char === "-") {

                // first dump what we have now in the current group into the main hash
                hash += group.substring(0, padNum).padStart(padNum, padChrLo);

                // if the hash is still not full length, then pad it to the maximum length
                if (hash.length < hl) {
                    hash = hash.padEnd(hl, padChrLo);
                }

                // reset group for next possible iteration
                group = "";

            // keep adding characters to the current group until something special happens
            } else {
                group += char;
            }

        // we have full hash now (the part before dash, so let's take care about what's after dash)
        } else {

            // as long as we have not reached hash length that includes keyword after dash
            if (hash.length < hlExt) {

                // check for first numeric character after dash, but until it's not there, keep adding chars
                if (char < "0" || char > "9") {
                    group += char;
                // when we hit first numeric char after dash, accept the accumulated suffix string
                } else {
                    // add suffix to the hash (pad and cut accordingly)
                    hash += group.substring(0, padAlph).padEnd(padAlph, padChrHi);
                    // keep the numeric char for the final group
                    group = char;
                }

            // keep adding characters to the current group as long as we are here
            } else {
                group += char;
            }
        }
    }

    // iterating over the version string is done but have we reached final hash length yet?
    if (hash.length < hl) {
        // if the version string did not contain max amount of dotted groups possible,
        // we end up with incomplete hash and remaining chars in the group variable
        // so dump them into the hash now
        hash += group.substring(0, padNum).padStart(padNum, padChrLo);

        // check if we are still lacking final hash length, if so pad the hash to its maximum
        if (hash.length < hl) {
            hash = hash.padEnd(hl, padChrLo) + padChrHi.repeat(padAlph) + padChrLo.repeat(padNum);
        }
    }

    // we may still have some chars remaining in a group (the final one, after dash, after suffix)
    if (hash.length < hlFull) {
        hash += group.substring(0, padNum).padStart(padNum, padChrLo);
    }

    // happy hashing
    return hash;
}


// formats date as a simple YYYY-MM-DD, assumes valid date object is provided
// checks if optional moment.js library is loaded and custom formatting provided (will be applied then)
function formatDate(date, dateFormat) {
    if (window.moment && (dateFormat || yaml.specs.options.dateFormat)) {
        return window.moment(date).format(dateFormat || yaml.specs.options.dateFormat);
    } else {
        return date.toISOString().replace(/T.*/, "");
    }
}


// the data for the table cell may come from 'untrusted' source and in somewhat 'relaxed' format
// it needs to be normalized using: a) 'specs.yml' b) common sense  c) some JavaScript types voodoo
//
// you can stop reading here, the rest of the knowledge would be required if something looks broken
//
// the supported data types are: 'str', 'int', 'intrange', 'ip', 'date', 'version' and each of
// those data type must allow sensible comparison operations as well as direct/regex matching,
// therefore, several different internal representations of the initially supplied value are required:
//
//     .html    "what should be displayed" in the table cell (may or may not look like the actual value)
//     .match   "case insensitive string representation" for =, !=, ~, !~ matching
//     .cmp     "integer OR hashed string representation" for <, > comparison and sorting
//     .cmpMin  "min integer" for 'intrange' and 'ip' data types and < comparison only
//     .cmpMax  "max integer" for 'intrange' and 'ip' data types and > comparison only
//     .mask    "integer netmask representation" for 'ip' data type and @= comparison only
//
// it is not expected that these representations should be supplied together with the raw value, since
// most of them can be automatically derived from the initial value (unless special/unique logic is required)
//
// the function below takes care about creating those representations for a given cell and normally should
// never be run more than once per cell, being a part of preRenderBody()
//
// in certain cases the conversion to various representations relies on the formatting of the initial value,
// especially when the data type allows various options (like 'date' or 'intrange' or 'ip', etc.), so the rules
// of conversion are as follows:
//
// 1. the data type (defined in 'specs.yml') will always be considered as the basis of all conversion logic
// 2. non-trivial data types (not 'int' / 'str') must have initial value formatted in a certain way (see below)
// 3. any of the representation(s) (like .cmp or .match, etc.) can be user-supplied but they must fit the type
// 4. if the supplied representation does not fit the type (for example .cmpMin for a 'str'), it'll be removed
// 5. if the supplied value type or its expected formatting does not match the defined type, and the automated
//    conversion is impossible, the representations will be set to special 'bad' value (see below)
//
// the expected formatting for non-trivial data types is as follows:
//
// intrange: either a single integer or a string with two positive integers separated by non-numeric characters
//           other characters (anything before the first integer and all characters after the second integer)
//           will be discarded
//
// date:     can be given in 3 different formats:
//               1) as an actual JavaScript Date object
//               2) as a positive integer, representing milliseconds since January 1, 1970, 00:00:00 UTC
//               3) as an ISO 8601 formatted date string (or any other string compatible with Date.parse())
//
// ip:       at present only IPv4 addressing is supported
//           the valid IP address value should be a string containing the IP address in a form int.int.int.int
//           followed by optional netmask specification, either in the int.int.int.int or /int format
//           if the netmask is omitted or badly formatted, it will be automatically set to /32 (i.e., 1 host)
//           all the characters before the first int value and after the netmask value will be ignored
//
// version:  usually can be any string but typically it is expected that it is something like 'x.x.x-blah-x'
//           to which a hashing function will be applied to obtain the .cmp representation, see comments to the
//           version2hash() function to check for its limitations and assumptions
//
// when the supplied data does not match the defined type, it needs to be handled in a special way
// firstly, a check is made if the automated conversion could be possible (like between some integers and strings)
// when the auto-handling is impossible and/or the value is weird (for example, 'undefined' or 'NaN' or 'null' or
// Object/Array is supplied instead of scalar type), 2 decisions will have to be taken:
//     - what to show in the table cell (i.e., what should the .html representation be like)
//     - what should be the special values for internal representation of a 'bad' data that will affect sorting
//
// with regards to the '.html' representation of the 'bad' value, the following logic will be used:
//     - if the supplied value is a specially formatted string (like 'ip', 'intrange', 'date', 'version')
//       but formatting is bad, the actual string value will be retained (but see notes about CSS class below)
//     - otherwise, if the user has supplied the .htmlAlt value for a particular cell, it will be used
//     - otherwise, if there exists .htmlAlt value defined in 'specs.yml' for the whole column, it will be used
//     - otherwise, if there exists .htmlAlt value defined in 'specs.yml' for the whole table, it will be used
//     - otherwise, a "string representation of the bad value" will be used (like "Null", "Undefined", etc.)
//     - in addition, the CSS class 'bad-value' will be automatically applied to each cell containing bad value
//
// it is important to note, that every time the '.html' representation changes due to a 'bad value' encountered,
// the '.match' representation will also be automatically adjusted accordingly in order to allow using filter
// expressions containing =, !=, ~, !~ on the bad values
//
// with regards to the .cmp*/.mask* representations of the 'bad' value, the following rules apply:
//
//     - for 'int' and 'intrange' data type, the .cmp* value(s) will be set to Number.NEGATIVE_INFINITY
//     - for 'str' and 'version' the .cmp value will be set to empty string
//     - for 'ip' the .cmp and .mask values will be set to an equivalent of 0.0.0.0 /0
//     - for 'date' the .cmp value will be an equivalent of Unix time stamp 0 (January 1, 1970, 00:00:00 UTC)
//
function normalizeValue(row, column) {

    // check if supplied value is already an object
    if ($typeOf(row[column.key]) === "Object") {

        // if .value was not provided but .html was, convert 'html' to 'value'
        if (!$hasProp(row[column.key], "value") &&
                $hasProp(row[column.key], "html") &&
                $typeOf(row[column.key].html) === "String") {
            row[column.key].value = html2text(row[column.key].html);
        }

    // if a 'shorthand' syntax was used to supply initial value
    // (i.e. just the value given directly not embedded inside an object),
    // re-create current cell's data as an object with a single .value property
    } else {
        row[column.key] = {value: row[column.key]};
    }

    // use shortcuts to get to most commonly used properties and values
    const cell = row[column.key];
    cell.type = $typeOf(cell.value);

    // normalize cssClass into array (if not already)
    value2array(cell, "cssClass");

    // process 'int' data type
    if (column.type === "int") {

        // check if the actually supplied value is true 'numeric'
        if (cell.type === "Number" && !isNaN(cell.value)) {

            if (!$hasProp(cell, "html") || $typeOf(cell.html) !== "String") {
                cell.html = cell.value.toString();
            }

            if (!$hasProp(cell, "cmp") || $typeOf(cell.cmp) !== "Number" || isNaN(cell.cmp)) {
                cell.cmp = cell.value;
            }

            if (!$hasProp(cell, "match") || $typeOf(cell.match) !== "String") {
                cell.match = cell.value.toString().toUpperCase();
            }

        // last chance for a string to become a number
        } else if (cell.type === "String") {

            if (!isNaN(cell.value)) {
                cell.html = parseInt(cell.value).toString();
                cell.cmp = parseInt(cell.value);
                cell.match = cell.cmp;
            } else {
                cell.html = escapeHtml(cell.value);
                cell.cmp = Number.NEGATIVE_INFINITY;
                cell.match = html2text(cell.html).toUpperCase();
                cell.cssClass.push("bad-value");
            }

        // the value is 'bad' (non-scalar type, null, undefined, etc.)
        } else {
            cell.html = undefined;
            cell.cmp = Number.NEGATIVE_INFINITY;
            cell.match = undefined;
        }

    // process 'intrange' data type
    } else if (column.type === "intrange") {

        // check if the actually supplied value is true 'numeric'
        // in which case the 'range' is simply a single numeric value
        if (cell.type === "Number" && !isNaN(cell.value)) {

            if (!$hasProp(cell, "html") || $typeOf(cell.html) !== "String") {
                cell.html = cell.value.toString();
            }

            if (!$hasProp(cell, "cmpMin") || $typeOf(cell.cmpMin) !== "Number" || isNaN(cell.cmpMin)) {
                cell.cmpMin = cell.value;
            }

            if (!$hasProp(cell, "cmpMax") || $typeOf(cell.cmpMax) !== "Number" || isNaN(cell.cmpMax)) {
                cell.cmpMax = cell.value;
            }

            if (!$hasProp(cell, "match") || $typeOf(cell.match) !== "String") {
                cell.match = cell.value.toString().toUpperCase();
            }


        // normally a 'range' would be represented by a properly formatted string
        // where two positive integers are separated by non-numeric characters
        } else if (cell.type === "String") {

            const intrangeRegex = RegExp("([0-9]+)([^0-9]+([0-9]+))?");
            const matches = intrangeRegex.exec(cell.value);

            if (matches !== null) {
                const rangeMin = parseInt(matches[1]);
                const rangeMax = matches[3] !== undefined ? parseInt(matches[3]) : rangeMin;

                if (!$hasProp(cell, "html") || $typeOf(cell.html) !== "String") {
                    cell.html = escapeHtml(cell.value);
                }

                if (!$hasProp(cell, "cmpMin") || $typeOf(cell.cmpMin) !== "Number" || isNaN(cell.cmpMin)) {
                    cell.cmpMin = rangeMin;
                }

                if (!$hasProp(cell, "cmpMax") || $typeOf(cell.cmpMax) !== "Number" || isNaN(cell.cmpMax)) {
                    cell.cmpMax = rangeMax;
                }

                if (!$hasProp(cell, "match") || $typeOf(cell.match) !== "String") {
                    cell.match = cell.value.toUpperCase();
                }

            // the value does not look like a correctly formatted range string
            } else {
                cell.html = escapeHtml(cell.value);
                cell.cmpMin = Number.NEGATIVE_INFINITY;
                cell.cmpMax = Number.NEGATIVE_INFINITY;
                cell.match = html2text(cell.html).toUpperCase();
                cell.cssClass.push("bad-value");
            }

        // the value is 'bad' (non-scalar type, null, undefined, etc.)
        } else {
            cell.html = undefined;
            cell.cmpMin = Number.NEGATIVE_INFINITY;
            cell.cmpMax = Number.NEGATIVE_INFINITY;
            cell.match = undefined;
        }

    // process 'ip' data type
    } else if (column.type === "ip") {

        // normally an 'ip' would be represented by a properly formatted string
        // either in 'x.x.x.x' form or 'x.x.x.x /x' or 'x.x.x.x /x.x.x.x'
        if (cell.type === "String") {

            if (!$hasProp(cell, "html") || $typeOf(cell.html) !== "String") {
                cell.html = escapeHtml(cell.value);
            }

            if (!$hasProp(cell, "match") || $typeOf(cell.match) !== "String") {
                cell.match = html2text(cell.html).toUpperCase();
            }

            // good luck deciphering this one... ( it is basically what is stated above about the expected IP/MASK string formatting)
            const intrangeRegex = RegExp("(\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}(?!\\d))(\\s*\\/((\\d{1,3})(\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3})?)?)?");
            const matches = intrangeRegex.exec(cell.value);
            const ipAddr = (matches !== null) ? ip2long(matches[1]) : 0;
            const maskStr = (matches !== null && matches[3] !== undefined) ? matches[3] : "32";
            const ipMask = maskStr.includes(".") ? ip2long(maskStr) : cidr2long(parseInt(maskStr));

            if (!$hasProp(cell, "cmpMin") || $typeOf(cell.cmpMin) !== "Number" || isNaN(cell.cmpMin)) {
                cell.cmpMin = (ipAddr & ipMask) >>> 0;
            }

            if (!$hasProp(cell, "cmpMax") || $typeOf(cell.cmpMax) !== "Number" || isNaN(cell.cmpMax)) {
                cell.cmpMax = (ipAddr | ~ipMask) >>> 0;
            }

            if (!$hasProp(cell, "mask") || $typeOf(cell.cmpMax) !== "Number" || isNaN(cell.mask)) {
                cell.mask = ipMask;
            }

            // the value does not look like a correctly formatted IP string
            if (!ipAddr) {
                cell.cssClass.push("bad-value");
            }

        // the value is 'bad' (non-string or non-scalar type, null, undefined, etc.)
        } else {
            cell.html = undefined;
            cell.cmpMin = Number.NEGATIVE_INFINITY;
            cell.cmpMax = Number.NEGATIVE_INFINITY;
            cell.match = undefined;
        }

    // process 'date' data type
    } else if (column.type === "date") {

        // if JavaScript Date object is given, have it as is,
        // if a number is given, treat it as Unix time stamp (allow both seconds or milliseconds)
        if ((cell.type === "Date" && !isNaN(cell.value)) || (cell.type === "Number" && cell.value > 0)) {

            // get date object (if needed, convert Unix timestamp)
            const date = (cell.type === "Date")
                ? cell.value
                // assume Unix time stamp in seconds if the numeric value is reasonably low
                : (new Date((cell.value < 10000000000) ? cell.value * 1000 : cell.value));

            if (!$hasProp(cell, "html") || $typeOf(cell.html) !== "String") {
                cell.html = escapeHtml(formatDate(date, column.dateFormat));
            }

            if (!$hasProp(cell, "cmp") || $typeOf(cell.cmp) !== "Number" || isNaN(cell.cmp)) {
                cell.cmp = date.getTime();
            }

            if (!$hasProp(cell, "match") || $typeOf(cell.match) !== "String") {
                cell.match = html2text(cell.html).toUpperCase();
            }

        // if a string is given, try and treat it as an ISO 8601 formatted date string
        } else if (cell.type === "String") {

            if (!$hasProp(cell, "html") || $typeOf(cell.html) !== "String") {
                cell.html = escapeHtml(cell.value);
            }

            if (!$hasProp(cell, "match") || $typeOf(cell.match) !== "String") {
                cell.match = html2text(cell.html).toUpperCase();
            }

            const date = new Date(cell.value.match(/^\d{4}-\d{2}-\d{2}$/) ? cell.value + "T12:00:00Z" : cell.value);

            // if date formatting is OK, then process it as above
            if (!isNaN(date)) {

                if (!$hasProp(cell, "cmp") || $typeOf(cell.cmp) !== "Number" || isNaN(cell.cmp)) {
                    cell.cmp = date.getTime();
                }

            // otherwise, it is a malformed date string and should be flagged as such
            } else {
                cell.cmp = 0;
                cell.cssClass.push("bad-value");
            }

        // the value is 'bad' (non-string or non-scalar type, null, undefined, etc.)
        } else {
            cell.cmp = 0;
            cell.match = undefined;
            cell.html = undefined;
        }

    // process 'version' data type
    } else if (column.type === "version") {

        // check if the actually supplied value is string or a positive number
        if (cell.type === "String" || (cell.type === "Number" && cell.value > 0)) {

            if (!$hasProp(cell, "html") || $typeOf(cell.html) !== "String") {
                cell.html = escapeHtml(cell.value);
            }

            if (!$hasProp(cell, "cmp") || $typeOf(cell.cmp) !== "String") {
                cell.cmp = version2hash(cell.value);
            }

            if (!$hasProp(cell, "match") || $typeOf(cell.match) !== "String") {
                cell.match = html2text(cell.html).toUpperCase();
            }

        // the value is 'bad' (non-scalar type, null, undefined, etc.)
        } else {
            cell.cmp = "";
            cell.match = undefined;
            cell.html = undefined;
        }

    // fallback to 'str' data type
    // (in case some weird/unknown type was given in 'specs.yml' for a column)
    } else {

        // check if the actually supplied value is a string
        if (cell.type === "String") {

            if (!$hasProp(cell, "html") || $typeOf(cell.html) !== "String") {
                cell.html = escapeHtml(cell.value);
            }

            if (!$hasProp(cell, "cmp") || $typeOf(cell.cmp) !== "String") {
                cell.cmp = cell.value.toUpperCase();
            }

            if (!$hasProp(cell, "match") || $typeOf(cell.match) !== "String") {
                cell.match = html2text(cell.html).toUpperCase();
            }

        // last chance for a sane numeric / boolean value to become a string
        } else if ((cell.type === "Number" && !isNaN(cell.value)) || cell.type === "Boolean") {
            cell.html = escapeHtml(cell.value.toString());
            cell.cmp = cell.value.toString().toUpperCase();
            cell.match = cell.cmp;

        // the value is 'bad' (non-scalar type, null, undefined, etc.)
        } else {
            cell.cmp = "";
            cell.match = undefined;
            cell.html = undefined;
        }
    }


    // handle 'bad' value situation (mismatched value type vs declared type)
    // set .html and then .match accordingly using all possible fallback .htmlAlt possibilities
    if (cell.html === undefined) {

        if ($hasProp(cell, "htmlAlt") && $typeOf(cell.htmlAlt) === "String") {
            cell.html = cell.htmlAlt;
        } else if ($hasProp(column, "htmlAlt") && $typeOf(column.htmlAlt) === "String") {
            cell.html = column.htmlAlt;
        } else if ($hasProp(yaml.specs.options, "htmlAlt") && $typeOf(yaml.specs.options.htmlAlt) === "String") {
            cell.html = yaml.specs.options.htmlAlt;
        } else {
            cell.html = cell.type;
        }

        cell.match = html2text(cell.html).toUpperCase();

        cell.cssClass.push("bad-value");
    }

    // cleansing operation to make sure that what shouldn't exist, does not (even if supplied by the user)
    if (column.type === "intrange" || column.type === "ip") {
        if ($hasProp(cell, "cmp")) {
            delete cell.cmp;
        }
    } else {
        if ($hasProp(cell, "cmpMin")) {
            delete cell.cmpMin;
        }

        if ($hasProp(cell, "cmpMax")) {
            delete cell.cmpMax;
        }
    }

    if ($hasProp(cell, "mask") && column.type !== "ip") {
        delete cell.mask;
    }
}


// this module provides core functionality to other parts of the code
export {$, $$, $hasProp, $typeOf, updateView, saveState, escapeHtml, html2text, value2array, ip2long, cidr2long, version2hash, formatDate, normalizeValue};
