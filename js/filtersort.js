// globally shared state and data objects plus some useful common shortcuts and functions
import {yaml, data, display} from "./main.js";
import {$hasProp, ip2long, version2hash} from "./common.js";


// supported filter operators and their precedence (importance)
const op = {"==": 3, "=": 3, "!=": 3, "~": 3, "!~": 3, "@=": 3, "<": 3, ">": 3, "AND": 2, "OR": 1};

// a map of column types for easy lookups during filter string parsing
const typeMap = {};

// two lists of all possible tokens that should be useful during filter string parsing
const filterTokens = {word: [], nonWord: []};


// splits the text string from the 'input' field into array of recognised filter tokens
// should correctly identify known tokens even without whitespace in between (where applicable)
// correctly deals with parameters in double quotes that should be treated as a single token
// also correctly parses unquoted parameters (that should not contain whitespace)
// takes the input string as the first argument and two arrays of strings for all possible tokens
// the wordTokens[] should contain all recognized tokens that start with alphanumeric characters
// the nonWordTokens should contain all recognized tokens that do NOT start
// both token arrays must be ordered by token length in the reverse order,
// i.e. array's zero element should be the longest token and the last element - the shortest
function getTokens(input, wordTokens = [], nonWordTokens = []) {

    // resulting array of all detected filter tokens
    const tokens = [];

    // check that the supplied token arrays are not empty
    if (wordTokens.length === 0 || nonWordTokens.length === 0) {
        return tokens;
    }

    // prepare three RegExp objects to lookup possible tokens in several different ways
    const regex = {
        words:    new RegExp("^\\b\\s*(" + wordTokens.join("|") + ")\\s*\\b", "i"),
        nonWords: new RegExp("^\\s*(\"[^\"]*\"|" + nonWordTokens.join("|") + "|!\\(|NOT\\(|\\)|\\()\\s*"),
        unquoted: /^\s*([^\s()]+)/
    };

    // keep track of the current offset in the input string and the remainder of the string
    let offset = 0;
    let str = input.substring(offset);
    let token, match;

    // repeat, as long as there are any characters remaining to be parsed in the input string
    while (str) {
        // try checking whether current string starts with one of the non-word tokens
        match = str.match(regex.nonWords);

        // if there is a match, consume the token and increase the offset pointer accordingly
        if (match !== null) {
            offset += match[0].length;
            token = match[0].trim();

        // if there was no match above, do more checking
        } else {
            // try checking whether current string starts with a word token or quoted string
            match = str.match(regex.words);

            // if there was a match, consume the token and increase the offset pointer
            if (match !== null) {
                offset += match[0].length;
                token = match[0].trim();

            // if there was still no match, it must be some arbitrary unquoted value
            } else {

                // check for the unquoted value (everything until next whitespace or parenthesis)
                match = str.match(regex.unquoted);
                if (match !== null) {
                    offset += match[0].length;
                    token = match[0].trim();

                // in case the above does not produce valid token, gobble the rest of the string
                } else if (str) {
                    offset += str.length;
                    token = str.trim();
                }
            }
        }

        // push newly obtained token into the result array
        tokens.push(token);

        // move the offset pointer along the input string
        str = input.substring(offset);
    }

    // return the resulting array of tokens
    return tokens;
}


// converts existing array of tokens (operand, operator, value, ...) into Reverse Polish Notation
// the output is a rearranged tokens array that takes into account operator precedence
// the RPN tokens array will be used to apply the actual filtering rules to each table row
// this function implements a particular case of the Edsger W. Dijkstra's 'Shunting-yard algorithm'
function tokensToRPN(tokens) {

    // the Shunting-yard algorithm requires a LIFO stack to achieve the result
    const stack = [];
    // also needs a helper function to check the top value in the stack without actual retrieval
    const peek = (x) => x[x.length - 1];

    // loop through the input tokens array using the reduce() JS method
    // returns another array where the final result will be accumulated output
    return tokens.reduce((output, token) => {

        // create uppercase version of the current token
        const tokenUpper = token.toUpperCase();

        // handle the case when the current token is one of the known operators
        if ($hasProp(op, tokenUpper)) {

            while ($hasProp(op, peek(stack)) && op[tokenUpper] <= op[peek(stack)]) {
                output.push(stack.pop());
            }
            stack.push(tokenUpper);

        // handle the case when the token is one of the parentheses operators
        } else if (token === "(" || token === "!(" || tokenUpper === "NOT(") {
            stack.push(token);

        // handle the case when the token is one of the parentheses operators
        } else if (token === ")") {
            while (peek(stack) !== "(" && peek(stack) !== "!(" && peek(stack) !== "NOT(") {
                output.push(stack.pop());
            }
            if (stack.pop() !== "(") {
                output.push("!");
            }

        // this is not an operator, just a simple operand, so put it into result array
        } else {
            output.push(token);
        }

        // proceed to the next loop iteration and next token while accumulating the overall result
        return output;

    // once the loop is over, add the remaining stack contents to the result (in reverse order)
    }, []).concat(stack.reverse());
}


// performs the 'dry-run' on the filter expression that should already be in Reverse Polish Notation
// this serves two purposes: one is to check filter for syntax correctness and report possible errors
// second is to perform possible conversion of some operands (like RegExp strings or IPs or Dates)
// this is done to speed-up the filtering process that will be repeated many real data rows
// the converted values will be written back to the filterRPN[] array that is given as the argument
// returns boolean 'true' if all is well or 'false' if any of the checks have failed
function checkFilter(filterRPN) {

    // result will be either Boolean true, or an actual error message String
    let result = true;

    // a LIFO result stack for evaluating the Reverse Polish Notation expression
    const stack = [];

    // if typeMap{} object is empty, fill it up with data (done once only, never again)
    if (Object.keys(typeMap).length === 0) {
        // just take column types and map them to column keys
        yaml.specs.table.forEach(column => {typeMap[column.key] = column.type || "str";});
    }

    // loop through each token in the filter expression RPN array and determine the overall result
    // the .every() method will ensure that ALL checks must succeed, otherwise the loop will terminate
    filterRPN.every((token, index) => {

        // operands and their data type will be determined later
        let o1, o2, type;

        // if the current filter token is one of the known operators, check its validity
        if ($hasProp(op, token)) {

            // first get two items from the stack to, hopefully, perform the operation on
            o2 = stack.pop();
            o1 = stack.pop();

            // if one of the operands is missing, then the expression was wrong (syntax error)
            if (o1 === undefined || o2 === undefined) {
                result = "Filter syntax error (1)";
                return false;
            } else {

                // if the 1st operand is NOT the result of previous (nested) operation
                // and if the 1st operand does not look like it is a valid column key,
                // then it is a syntax error, i.e. non-existing field name
                if (o1.idx !== -1 && !$hasProp(typeMap, o1.token)) {
                    result = "Invalid field name: " + o1.token;
                    return false;
                }

                // if the 2nd operand starts with a double quote, it is assumed it ends with it too
                // the quotes are dropped and the operand value in the RPN filter expression is updated
                if (String(o2.token).charAt(0) === "\"") {
                    o2.token = o2.token.substring(1, o2.token.length - 1);
                    filterRPN[o2.idx] = o2.token;
                }

                // if the operator is straight comparison, the 2nd operand should be converted to uppercase
                // this is due to the case-insensitive comparison promise that shall be kept
                if (token === "==" || token === "=" || token === "!=") {
                    filterRPN[o2.idx] = String(o2.token).toUpperCase();

                // if the operator does regex matching, the 2nd operand is assumed to be a user supplied regex
                // the 2nd operand has to be converted to JS RegExp object to be reused during actual filtering
                // if the conversion fails due to bad RegExp syntax, then it is a full stop here
                } else if (token === "~" || token === "!~") {
                    try {
                        o2.regexp = new RegExp(o2.token, "i");
                    } catch (e) {
                        result = "Invalid regular expression: " + o2.token;
                        return false;
                    }
                    filterRPN[o2.idx] = o2.regexp;

                // 'greater/less than' comparison is by far the most 'interesting' operator
                // each data type requires different approach for comparing values so there is a lot of 'if' here
                } else if (token === "<" || token === ">") {

                    // determine the data type by looking at the first operand
                    type = typeMap[o1.token] || "str";

                    // for the 'ip' data type the comparison shall be done using long int representation
                    // the 2nd operand shall be converted, therefore, and the RPN expression updated
                    if (type === "ip") {
                        o2.value = ip2long(o2.token);
                        if (!o2.value) {
                            result = "Bad IP address: " + o2.token;
                            return false;
                        } else {
                            filterRPN[o2.idx] = o2.value;
                        }

                    // if the data type is 'date', the 2nd operand needs to be Unix Time obtained from 'YYYY-MM-DD' string
                    } else if (type === "date") {

                        // first check the validity of the user supplied date string generally speaking
                        if (!String(o2.token).match(/^\d{4}-\d{2}-\d{2}$/)) {
                            result = "Bad date format (use YYYY-MM-DD): " + o2.token;
                            return false;
                        }

                        // then try and convert the 2nd operand into the JavaScript date object and get its Unix Time
                        o2.value = new Date(String(o2.token) + "T12:00:00Z").getTime();

                        // check the allowed range for the supplied date that should be a valid integer and a sane value
                        if (!o2.value || o2.value < 934366740000 || o2.value > 2147483647000) {
                            result = "Unsupported date: " + o2.token;
                            return false;
                        }
                        // update the RPN expression with the converted value
                        filterRPN[o2.idx] = o2.value;

                    // for integer types the 2nd operand should simply be whatever parseInt() returns (or zero if NaN)
                    } else if (type === "int" || type === "intrange") {
                        filterRPN[o2.idx] = parseInt(o2.token) || 0;

                    // version shall be compared as a hash
                    } else if (type === "version") {
                        filterRPN[o2.idx] = version2hash(o2.token);

                    // strings shall be compared case insensitive, so get the uppercase version of the string
                    } else if (type === "str") {
                        filterRPN[o2.idx] = String(o2.token).toUpperCase();
                    }

                // if the operator is a special 'IP belongs to subnet', the 2nd operand needs to converted to longint
                } else if (token === "@=") {

                    // first make sure that the filed type is actually 'ip' because the @= operator cannot be used otherwise
                    if (typeMap[o1.token] !== "ip") {
                        result = "@= operator can only be used with IP-like fields";
                        return false;

                    // do the same routine as above for '< >' operator and 'ip' data type
                    } else {
                        o2.value = ip2long(o2.token);
                        if (!o2.value) {
                            result = "Bad IP address: " + o2.token;
                            return false;
                        } else {
                            filterRPN[o2.idx] = o2.value;
                        }
                    }
                }

                // no real operation will be done because the actual result does not matter during dry run
                // push value placeholder into the stack in case it is needed for nested filters with AND/OR/() operators
                stack.push({token: "", idx: -1});
            }

        // if it is a known unary operator, like "NOT(" or "!(", then check for a single operand
        } else if (token === "!") {

            o1 = stack.pop();

            // if the operand is missing, then the expression was wrong (syntax error)
            if (o1 === undefined) {
                result = "Filter syntax error (2)";
                return false;
            }

            // no real operation will be done because the actual result does not matter during dry run
            // push value placeholder into the stack in case it is needed for nested filters with AND/OR/() operators
            stack.push({token: "", idx: -1});

        } else {

            // if the current filter token is not an operator, then it is an operand
            // keep it in stack for now and use it later, when an actual operator is encountered
            stack.push({token: token, idx: index});
        }

        // if nothing broke so far, proceed to the next filter token
        return true;
    });


    // if the 'result' is still 'true' (as set at the very beginning of this function),
    // it means all the checking until now was successful; but there is one more thing to verify:
    // there should be precisely one item in the stack, not less, not more
    if (result === true && stack.length !== 1) {
        result = "Filter syntax error (3)";
    }

    return result;
}


// performs actual data filtering using the filter expression in the Reverse Polish Notation
// loops through the display[] array and checks each matching data row against filter expression
// if filter expression returns 'true' then the 21st bit of the value is unset, otherwise it is set
// the tables rows with the IDs from the display[] array with the 21st bit set will not be rendered
function runFilter(filterRPN) {

    // result will be either Boolean true, or an actual error message String
    let result = true;

    // resolving expression in RPN notation requires a LIFO helper stack
    const stack = [];

    // loop through each display[] array item but stop if at least one error is encountered
    // this is ensured by the .every() method that will break the loop if the callback returns false
    display.every((rowID, key) => {

        // reset the helper LIFO stack
        stack.length = 0;

        // remove 21st bit from the rowID (might be there from previous filtering run)
        rowID &= 1048575;

        // apply filtering expression to the current data row by looping through each filter token
        filterRPN.forEach(token => {

            // operands and result of the operation will be determined later
            let o1, o2, res;

            // if the current filter token is one of the known operators, perform that operation
            if ($hasProp(op, token)) {

                // to perform the operation two operands are required, so get them from the stack
                // it is already been ensured by checkFilter() that there must be at least two items available
                o2 = stack.pop();
                o1 = stack.pop();

                // act according to the requested operator
                // o2 (operand #2) should already be set to correct value
                // o1 (operand #1) is the name of the column key at this stage
                // so the actual o1 value needs to be pulled out of the data[] array using current rowID
                // the 'flavour' of the data value (text, int, ...) depends on the operator
                if (token === "=" || token === "==") {
                    res = (data[rowID][o1].match === o2);

                } else if (token === "!=") {
                    res = (data[rowID][o1].match !== o2);

                } else if (token === "~") {
                    res = o2.test(String(data[rowID][o1].match));

                } else if (token === "!~") {
                    res = ! o2.test(String(data[rowID][o1].match));

                } else if (token === "@=") {
                    res = (data[rowID][o1].cmpMin === ((o2 & data[rowID][o1].mask) >>> 0));

                } else if (token === "<") {
                    if ($hasProp(data[rowID][o1], "cmpMax")) {
                        o1 = data[rowID][o1].cmpMax;
                    } else {
                        o1 = data[rowID][o1].cmp;
                    }
                    res = (o1 < o2);

                } else if (token === ">") {
                    if ($hasProp(data[rowID][o1], "cmpMin")) {
                        o1 = data[rowID][o1].cmpMin;
                    } else {
                        o1 = data[rowID][o1].cmp;
                    }
                    res = (o1 > o2);

                } else if (token === "AND") {
                    res = (o1 & o2);

                } else if (token === "OR") {
                    res = (o1 | o2);
                }

                // push the result of the operation into the stack to be used later again
                stack.push(res);

            } else if (token === "!") {
                o1 = stack.pop();
                stack.push(!o1);

            // if the current filter token is not an operator, then it is an operand
            // keep it in stack for now and use it later, when an actual operator is encountered
            } else {
                stack.push(token);
            }
        });

        // there should be exactly one item in the stack, i.e., the result of filtering for this row
        if (stack.length === 1) {

            // if the result is 'true', the 21st bit of the row ID shall be unset, otherwise it is set
            display[key] = stack.pop()
                ? display[key] & 1048575
                : display[key] | 1048576;

            // filtering of the current row is finished now, nothing is broken, so go ahead to next row
            return true;

        // if there were more (or less) than 1 items in the stack, something went wrong with RPN
        } else {
            result = "Filter syntax error (4)";
            return false;
        }
    });

    // return either Boolean true or a String (error message)
    return result;
}


// handle the complete process of data rows filtering with the filter string given as a parameter
// returns boolean value where 'false' means filter parsing/usage error or 'true' in case of success
// the main task here is to modify the display[] array that will be used to redraw the filtered table
function filterData(filter) {

    // assume nothing is going to happen if conditions are not met
    let result = false;

    // proceed if the input string is not empty
    if (filter !== "") {

        // if there was never words token list generated before, do it now (once only, for the app lifetime)
        if (filterTokens.word.length === 0) {

            // loop through the 'specs.yml' entries and pick all the column 'key' identifiers
            filterTokens.word = yaml.specs.table.map(column => column.key)
                // append word-like operators to that list of 'keys' (i.e. 'AND' and 'OR' operators)
                .concat(Object.keys(op).filter(token => token.match(/^[a-z]/i)))
                // sort the complete list in the order of descending token length
                .sort((a, b) => {
                    const x = a.length, y = b.length;
                    return (x > y ? -1 : (x < y ? 1 : 0));
                });
        }

        // if there was never a non-words token list generated before, do it now (once only)
        if (filterTokens.nonWord.length === 0) {

            // from the operators list pick only those operators that are not word-like
            filterTokens.nonWord = Object.keys(op).filter(token => !token.match(/^[a-z]/i))
                // sort the list in the order of descending token length
                .sort((a, b) => {
                    const x = a.length, y = b.length;
                    return (x > y ? -1 : (x < y ? 1 : 0));
                });
        }

        // try to parse the input filter string into valid tokens using the known token lists
        const tokens = getTokens(filter, filterTokens.word, filterTokens.nonWord);

        // if the string was parsed into at least 3 tokens then there might be a valid filter expression
        if (tokens && tokens.length > 2) {

            // try and convert the current tokens list into Reverse Polish Notation
            const filterRPN = tokensToRPN(tokens);

            // perform a dry-run on the tokenized filter to check for possible errors before filtering
            // result will be either Boolean true or a String (error message)
            result = checkFilter(filterRPN);

            // if the syntax was correct run actual filtering routine on all table rows and return its result
            if (result === true) {
                // result will be either Boolean true or a String (error message)
                result = runFilter(filterRPN);
            }
        }
    }

    return result;
}


// sort table column, essentially by modifying the order of values in the display[] array
// uses column key label and sorting order (0 / 1)
function sortData(colKey, order) {

    // sort the display[] array using the callback function that will determine new order
    display.sort((a, b) => {

        // clear 21st bit of the row ID (operate on all rows, ignoring filtering)
        a &= 1048575;
        b &= 1048575;

        // if the data type has 'min/max' representation (intrange), use those for comparison
        if ($hasProp(data[a][colKey], "cmpMin")) {

            // for ascending direction use min values for port ranges
            if (order) {
                a = data[a][colKey].cmpMin;
                b = data[b][colKey].cmpMin;
            // for descending direction use max values for port ranges
            } else {
                a = data[a][colKey].cmpMax;
                b = data[b][colKey].cmpMax;
            }

        // otherwise, compare according to data type
        } else {
            a = data[a][colKey].cmp;
            b = data[b][colKey].cmp;
        }

        // compare values corresponding to the current sort direction
        if (order) {
            return (a > b) ? 1 : ((a < b) ? -1 : 0);
        } else {
            return (b > a) ? 1 : ((b < a) ? -1 : 0);
        }
    });
}


// this module provides sorting and filtering functions for the data table
export {filterData, sortData};
