// global variables and functions from other modules
import {$, $$, $hasProp, $typeOf, saveState, escapeHtml, html2text, value2array, normalizeValue} from "./common.js";
import {filterData, sortData} from "./filtersort.js";
import "./data.js";


// contains all loaded YAML resources converted to JSON
const yaml = {files: []};

// contains all (static) data for table displaying, sorting and filtering (two-dimensional array of rows / cells)
const data = [];

// contains the keys of the data[] array in the order that should be used for rendering table rows
// the values may have 21st bit set to 1 to indicate that the row should be skipped when rendering the table
// i.e., this is the array that will change with every sorting and filtering operation, not the data[] array
const display = [];

// the state of the one-page-app, such as current column view, row filter, sorting order and/or any other custom state
// this object will be encoded into the URL as a 'fragment identifier' to be able to pass the state as a URL
const state = {};

// human readable labels for sorting order, also used as CSS class names
const sortOrder = {"desc": 0, "asc": 1};

// a "spare" link element (never part of displayed contents) used as a helper to fake data download link
const $exportHelper = document.createElement("a");

// define separator characters for cells and rows when doing CSV-like export
const CSVfieldSeparator = "\t";
const CSVrecordSeparator = "\r\n";


// check if a partial or full column set needs to be displayed using 'view' property defined in global state,
// use view rules from specs.yml, including the _default view that should be displayed when no view is chosen
function setupView() {

    // check if we have to display a 'view', i.e. a subset of columns only
    if ($hasProp(yaml.specs, "views")) {

        // if no view was selected, check if default view is defined and if it is, then choose it instead
        if (!state.view && yaml.specs.views._default && $hasProp(yaml.specs.views, yaml.specs.views._default)) {
            saveState({view: yaml.specs.views._default}, true); // 'true' causes History.replaceState()
        }

        // check if the view exists (and is not 'full') and is an array; if so construct new array of table columns
        if (state.view && state.view !== "full" && $hasProp(yaml.specs.views, state.view) && Array.isArray(yaml.specs.views[state.view])) {

            yaml.specs.view = [];

            yaml.specs.views[state.view].forEach(key => {
                const column = yaml.specs.table.find(col => col.key === key);
                if (column) {
                    yaml.specs.view.push(column);
                }
            });

        } else {
            yaml.specs.view = yaml.specs.table;
        }

    } else {
        yaml.specs.view = yaml.specs.table;
    }
}


// create main table's header HTML code and custom CSS styles that apply to each column
// using the data from the 'specs.yml' file that defines the order of columns with optional 'views' and CSS rules
function renderHeader() {

    // iterate through the specs file and build the table header HTML
    const thead = "<tr>" + (yaml.specs.view || []).map(column =>

        "<th title=\"" + escapeHtml(column.key) + "\"" +
            (column.cssClass.length ? " class=\"" + column.cssClass.join(" ") + "\"" : "") +
            ">" + escapeHtml(column.header) + "</th>"

    ).join("") + "</tr>";

    // inject the table header HTML into the actual table
    $("#data-table thead").innerHTML = thead;

    // if table sorting is enabled in the global settings, assign table header handlers
    if (yaml.specs.options.sort === true) {

        // enable cursor as pointer on the table headers
        $("#data-table").classList.add("sortable");

        // register handler for the 'click' event on every table header element
        $$("#data-table thead th").forEach(el => el.addEventListener("click", sortColumn));
    }
}


// prepare all HTML code needed for rendering table rows using the data array
// this basically acts as a HTML 'cache' so that the renderBody() can rely on it every time
function preRenderBody() {

    // loop through each data row
    data.forEach(row => {

        // for each data cell run the normalization procedure to make sure the data is legit
        yaml.specs.table.forEach(column => normalizeValue(row, column));

        // loop through each column in the current view (from specs.yaml)
        const cellsHTML = (yaml.specs.view || []).map(column => {

            // the final CSS classes list for a cell is a join of 'specs.yml' and custom list from 'data'
            const cssClasses = [...column.cssClass, ...row[column.key].cssClass].join(" ").trim();

            // return the complete HTML row <td>...</td> as a string to be joined later into final HTML code
            return "<td" + (cssClasses ? " class=\"" + cssClasses + "\"" : "") + ">" + row[column.key].html + "</td>";

        }).join("");

        // check if ._row property exists for each row, and if not then create it now
        if (!$hasProp(row, "_row")) {
            row._row = {};
        }

        // normalize ._row's cssClass into array (if not already)
        value2array(row._row, "cssClass");

        // assign the entire row HTML (<tr><td>...</td></tr>) to each row in the 'data' array
        const rowCssClasses = row._row.cssClass.join(" ").trim();
        row._row.html = "<tr" + (rowCssClasses ? " class=\"" + rowCssClasses + "\"" : "") + ">" + cellsHTML + "</tr>";
    });
}


// apply filtering, sorting and optional custom transformations to data using current 'state'
// (useful for initial page load and during back/forward navigation)
function applyState() {

    // if there is a filter present, it needs to be applied
    if (state.filter) {
        filterRows();
    }

    // if there is sorting to be done, do it on the appropriate column
    if (state.sort) {
        // check if sorted column is declared (sanity checking for column name)
        const colIndex = yaml.specs.view.findIndex(column => column.key === state.sort);
        if (colIndex > -1) {
            const $th = $("#data-table thead th:nth-child(" + (colIndex + 1) + ")");
            sortColumn({target: $th, detail: state.order});
        }
    }

    // fire custom state handler
    document.dispatchEvent(new Event("applyState"));
}


// create main table's body HTML code using the following components:
//    - display[] array as the guide (what rows should be displayed and in what order)
//    - data[] array as the source of the actual data to be placed in table rows
function renderBody() {

    // filter out only those rows where the 21st bit is NOT set for their rowID,
    // meaning that only the rows passing the current filter should be displayed
    const visibleRows = display.filter(rowID => !(rowID & 1048576));

    // loop through the visible rows and use the pre-rendered HTML from the _row.html property
    // to inject the resulting long HTML string into the actual DOM
    $("#data-table tbody").innerHTML = visibleRows.map(rowID =>data[rowID]._row.html).join("\n");

    // dispatch custom event after the table has been redrawn (in case someone is listening)
    // pass the count of visible rows to the event handler via the [event].detail property
    document.dispatchEvent(new CustomEvent("postRender", {detail: {visibleRowsCount: visibleRows.length}}));
}


// initialize page state using URI fragment identifier as the state source
function recoverStateFromURI() {

    // initialize 'state' object with possible data coming from the URI fragment identifier
    if (window.location.hash) {

        window.location.hash.substring(1).split("&").forEach(component => {
            const part = component.split("=");
            state[part[0]] = decodeURIComponent(part[1]);
        });
    }

    // initialize filter input
    $("#filter").value = state.filter || "";
}


// reset data filtering and sorting to default (initial state)
function resetDataFilterSort() {

    // clear filtering that may have already been applied
    $("#filter").value = "";
    $("#filter-error").setAttribute("hidden", "");
    display.forEach((_unused, key) => display[key] &= 1048575);

    // remove all sorting related classes from all table headers
    const keys = Object.keys(sortOrder);
    $$("#data-table thead th").forEach($th => $th.classList.remove(...keys));
}


// perform column sorting routine on table data and re-render table, when appropriate
function sortColumn(event) {

    // when changing the view but keeping sorting by column, it can happen that the column is gone
    if (!event.target) {
        return;
    }

    // determine column index and column data key, also set the default sort order
    const colIdx = event.target.cellIndex;
    const colKey = yaml.specs.view[colIdx].key;
    let order = "asc";

    // if this was true mouse click on table header (and not a simulated even handler trigger)
    if (event.composed) {

        // clear relevant CSS classes from previously sorted column (if such column existed)
        const prevCol = $("#data-table thead th[title='" + state.sort + "']");

        if (prevCol) {
            prevCol.classList.remove(...Object.keys(sortOrder));
        }

        // figure out new sorting order (depends if the same column was sorted-by previously or not)
        if (state.sort && state.sort === colKey) {
            order = Object.keys(sortOrder).filter(z => z !== state.order)[0];
        }

    // if this was a simulated click event (due to new page load with pre-existing state)
    } else if (event.detail === "asc" || event.detail === "desc") {

        order = event.detail;
    }

    // fire custom pre-sorting event, in case someone is listening, pass basic information via 'event.detail'
    document.dispatchEvent(new CustomEvent("preSort", {detail: {colIdx: colIdx, colKey: colKey, order: order}}));

    // assign new CSS class to the current column depending on the sort order
    event.target.classList.add(order);

    // perform column sorting (modify 'data' array according to all the rules for each data type)
    sortData(colKey, sortOrder[order]);

    // fire custom post-sorting event, in case someone is listening, pass basic information via 'event.detail'
    document.dispatchEvent(new CustomEvent("postSort", {detail: {colIdx: colIdx, colKey: colKey, order: order}}));

    // change page state only if the event came from actual column header click
    if (event.composed) {

        // modify the URL in the browser address bar to reflect current sort field and sort order
        saveState({sort: colKey, order: order});

        // redraw table body because the order of rows might have changed
        renderBody();
    }
}


// perform row filtering routine on table data and re-render table, when appropriate
function filterRows(event = {target: {}}) {

    // get the current filter text from the 'input' HTML element
    const filter = $("#filter").value.trim();

    // fire the pre-filtering event for custom handlers that might be listening
    document.dispatchEvent(new Event("preFilter"));

    // try applying the filter to the display[] array
    const filterResult = filterData(filter);

    // if filtering was successful, proceed with repainting the table
    if (filterResult === true) {

        // fire the post-filtering event for custom handlers that might be listening
        document.dispatchEvent(new Event("postFilter"));

        // change page state only if the event came from actual button click
        if (event.composed) {

            // modify the URL in the browser address bar to reflect current filter
            saveState({filter: filter});

            // reset error message placeholder
            $("#filter-error").setAttribute("hidden", "");

            // if applying the filter succeeded (i.e. filter syntax was OK)
            // then re-render table body using updated display[] array
            renderBody();
        }

    //if the returned value is a string, it must be the error message, so display it
    } else if ($typeOf(filterResult) === "String") {
        $("#filter-error").innerHTML = escapeHtml(filterResult);
        $("#filter-error").removeAttribute("hidden");
    }
}


// clicking on any table cell should auto create filters by using information about column and cell value
// also takes into account if SHIFT or CTRL key was pressed to allow multiple AND / OR conditions
function createFilter(event = {target: {}}) {

    // check that the event was triggered on the actual table cell (vs link inside a table cell)
    if (event.target.localName !== "td") {
        return;
    }

    // determine field 'key' from the 'specs.yml' file by using the index of the target view column
    const field = yaml.specs.view[event.target.cellIndex].key;

    // determine the actual value held in the table cell
    const value = event.target.textContent;

    // check the value for presence of whitespace and other operator-like characters
    const quote = (!value || value.match(/[\s<>()!=~@]/)) ? "\"" : "";

    // if the value contained special characters then use quotes around it
    const filter = field + (event.altKey ? " ~ " : " = ") + quote + value + quote;

    // if there was a CTRL key pressed during mouse click, append filter part with the AND condition
    if (event.ctrlKey) {
        $("#filter").value = $("#filter").value + ($("#filter").value ? " AND " : "") + filter;

    // if there was a SHIFT key pressed during mouse click, append filter part with the OR condition
    } else if (event.shiftKey) {
        $("#filter").value = $("#filter").value + ($("#filter").value ? " OR " : "") + filter;

    // if this was an ordinary mouse click, then replace current filter value with the new one
    } else {
        $("#filter").value = filter;
    }

    // hide error message placeholder
    $("#filter-error").setAttribute("hidden", "");
}


// reset all filtering and update table view accordingly
function clearFilter() {

    // clear current filter value in the HTML 'input' element
    $("#filter").value = "";

    // reset error message placeholder
    $("#filter-error").setAttribute("hidden", "");

    // remove 21st bit from every value in the display[] array to indicate 'no filtering'
    display.forEach((_unused, key) => display[key] &= 1048575);

    // update global state
    saveState({filter: undefined});

    // fire the clear-filtering event for custom handlers that might be listening
    document.dispatchEvent(new Event("clearFilter"));

    // re-render table body
    renderBody();
}


// creates a 'tab-separated CSV-like' text document that is served to the client
// simulates file download behaviour that forces browser to download a text file
function exportData() {

    // first get the list of column keys that are currently visible
    const visibleCols = Array
        .from(document.querySelectorAll("thead th"))
        .filter(el => el.offsetHeight || el.offsetWidth)
        .map(el => el.title);

    // create header row out of the header tags from 'specs.yml'
    const headerRow = yaml.specs.table
        .filter(column => visibleCols.includes(column.key))
        .map(column => column.header)
        .join(CSVfieldSeparator);

    // iterate through each row and filter our hidden rows
    // then, for each row iterate through the list of cells as per 'visibleCols' above
    // return tab separated text values (obtained from .html representation) joined into rows
    const bodyRows = display
        .filter(rowID => !(rowID & 1048576))
        .map(rowID => visibleCols
            .map(colID => html2text(data[rowID][colID].html || ""))
            .join(CSVfieldSeparator)
        ).join(CSVrecordSeparator);

    // construct final payload for downloading
    const exportedData = headerRow + CSVrecordSeparator + bodyRows;

    // simulate file download behaviour using 'Data URL' browser feature
    $exportHelper.href = "data:text/csv," + encodeURIComponent(exportedData);
    $exportHelper.download = "export.txt";
    $exportHelper.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true}));
}


// main initialiser block that assigns loaded YAML data to all necessary data structures
// also creates initial table view and assigns event handlers to HTML page elements (buttons, table cells)
// runs only after all YAML resources have finished loading, so the ymlData array should contain all data necessary
function init(ymlData) {

    // assign resources loaded from YAML files to the yaml{} global object
    ymlData.forEach(file => {

        let keySuffix;

        // do not overwrite existing keys in yaml object!
        if ($hasProp(yaml, file.key)) {
            keySuffix = 1;
            while ($hasProp(yaml, file.key + keySuffix)) {
                keySuffix += 1;
            }
            file.key = file.key + keySuffix;
        }

        // assign YAML data to yaml object with the correct key
        yaml[file.key] = file.data;
    });

    // normalize & sanitize CSS class definitions and date format strings from 'specs.yml'
    yaml.specs.table.forEach(column => {
        value2array(column, "cssClass");
        if ($hasProp(column, "dateFormat") && $typeOf(column.dateFormat) !== "String") {
            delete column.dateFormat;
        }
    });

    // sanitize global date format, if supplied in 'specs.yml'
    if ($hasProp(yaml.specs.options, "dateFormat") && $typeOf(yaml.specs.options.dateFormat) !== "String") {
        delete yaml.specs.options.dateFormat;
    }

    // call custom data parser from 'data.js' that should populate the 'data' array
    document.dispatchEvent(new Event("initData"));

    // fill the display[] array with initial values that correspond (one to one) to the data[] array keys
    // i.e., the initial table look will reflect yaml order as it was loaded from files (no sorting, no filtering)
    display.push(...data.keys());

    // initialize 'state' object with possible data coming from the URI fragment identifier
    recoverStateFromURI();

    // decide what columns need to be displayed
    setupView();

    // output HTML table header using the data from 'specs.yml'
    renderHeader();

    // prepare all table body HTML for future (re-)rendering
    preRenderBody();

    // if table filtering is enabled in the global settings, set necessary behaviours
    if (yaml.specs.options.filter === true) {

        // register handler for the 'click' event on the 'Filter' button
        $("#filter-apply").addEventListener("click", filterRows);

        // register handler for the 'keyup' event on the 'input' element to catch the Enter keypress and trigger filtering
        $("#filter").addEventListener("keyup", event => {
            if (event.key === "Enter") {
                event.preventDefault();
                $("#filter-apply").click();
            }
        });

        // register handler for the 'click' event on the 'Clear' button
        // removes 'input' field text and re-renders table body with no filters applied
        $("#filter-clear").addEventListener("click", clearFilter);

        // register handler for the 'click' event on each table cell so that filters could be created easily with a mouse click
        $("#data-table tbody").addEventListener("click", createFilter);

        // enable cursor as pointer on the table cells
        $("#data-table").classList.add("filterable");

        // generate the list of all possible column keys and insert it into the 'help text' HTML
        $("#field-names").innerHTML = "<var>" + yaml.specs.table.map(column => column.key).join("</var>, <var>") + "</var>";

        // register handler for the 'click' event on the 'Help' button to toggle the display of the 'help text'
        $("#filter-help").addEventListener("click", () => {
            const $helpBlock = $("#help-block");
            if ($helpBlock.hidden) {
                $helpBlock.removeAttribute("hidden");
            } else {
                $helpBlock.setAttribute("hidden", "");
            }
        });

        // show filtering controls
        $("#filter-block").removeAttribute("hidden");
    }

    // if data exporting is enabled in the global settings, show the button and enable behaviour
    if (yaml.specs.options.export === true) {
        $("#export-block").removeAttribute("hidden");
        $("#export-block button").addEventListener("click", exportData);
    }

    // all data has been initialized, including the idea about its filtering/sorting state, so apply it now
    applyState();

    // draw data table with all its initial state already applied
    renderBody();

    // fire custom event that allows to perform final one-time-only init user action before the table is revealed
    document.dispatchEvent(new Event("initRender"));

    // reveal the table that was hidden via the default 'hidden' HTML attribute in index.html
    $("#data-table").removeAttribute("hidden");
}


// creates error message about what went wrong during YAML loading/conversion and injects it into HTML
function reportError(error) {

    // errorMsg will contain the error message that should be displayed as HTML paragraph
    let errorMsg;

    // if HTTP status code is -1, it means that YAML got loaded but could not be parsed
    if (error.status === -1) {
        errorMsg = "YAML error while loading source data.<br /><br />" +
            escapeHtml(error.responseURL) + "<br /><br />" + escapeHtml(error.statusText);

    // if HTTP status code is 0, the XMLHttpRequest failed before getting any server response
    } else if (error.status === 0) {
        errorMsg = "Error while loading source data.";

    // if HTTP status code is greater than 0, HTTP response was received but it wasn't successful
    } else {
        errorMsg = "HTTP Error " + escapeHtml(error.status) + " [" + escapeHtml(error.statusText) +
            "] while loading source data.<br /><br />" + escapeHtml(error.responseURL);
    }

    // replace HTML page contents with the error message (no table or any other elements will be displayed)
    $("#error").innerHTML = errorMsg;
    $("#error").removeAttribute("hidden");
}


// loads YAML file via XMLHttpRequest asynchronously (returns Promise).
// 'fileSpec' is an object containing the name of the key under which data should be stored in the 'yaml' global,
// and the source filename (full or relative to 'yml' dir).
// the resolved Promise returns an object with YAML data and the corresponding key name
function getYaml(key, file) {

    // the only thing this function does is to return new Promise
    return new Promise((resolve, reject) => {

        // the Promise will be either resolved or rejected only after the XMLHttpRequest is done
        const req = new XMLHttpRequest();

        // YAML pages will be served from "GitHub Pages" with default mime-type that needs to be overridden
        req.overrideMimeType("text/plain");

        // the callback function that will be fired once XMLHttpRequest has been performed successfully
        req.onload = function (event) {

            // check the response HTTP status code for success (200)
            if (event.target.status === 200) {

                // if the response was successful, try converting the response from YAML to JSON
                try {

                    // check if key is numeric (means no custom key was provided, just an array of files)
                    if (/^\d+$/.test(key)) {
                        // try and generate key name from the file name (cut all but the actual file name)
                        key = file.replace(/.*\//, "").replace(/\..*/, "");
                    }

                    // eslint-disable-next-line no-undef
                    resolve({key: key, data: jsyaml.safeLoad(event.target.response)});

                // if YAML conversion failed (malformed YAML, etc.), reject the Promise defined above
                } catch (e) {
                    reject({status: -1, responseURL: event.target.responseURL, statusText: e.message});
                }

            // if HTTP response was NOT 200, reject the Promise defined above
            } else {
                reject(event.target);
            }
        };

        // the callback that will be fired in case XMLHttpRequest fails (before any server response) is the same as the success
        req.onerror = req.onload;

        // prepare the URL for the GET XMLHttpRequest
        let url = file.toLowerCase().startsWith("http") ? file : ("yml/" + file);
        url += (url.includes("?") ? "&_=" : "?_=") + Date.now();
        req.open("GET", url);

        // perform XMLHttpRequest (.onload() and .onerror() callbacks defined above will be fired upon completion)
        req.send();
    });
}


// handle view change (redraw the table header and the table body but don't reset the state)
document.addEventListener("updateView", () => {

    // decide what columns need to be displayed
    setupView();

    // output HTML table header using the data from 'specs.yml'
    renderHeader();

    // prepare all table body HTML for future (re-)rendering
    preRenderBody();

    // all data has been initialized, including the idea about its filtering/sorting state, so apply it now
    applyState();

    // draw data table with all its initial state already applied
    renderBody();

}, false);


// when navigation event has been detected, act as if page was loaded new
window.addEventListener("popstate", () => {

    // keep the idea of the current view (in case it should change)
    const oldView = state.view;

    // clear state object
    Object.keys(state).forEach(key => delete state[key]);

    // clear filtering/sorting that may have already been applied
    resetDataFilterSort();

    // recover state from URI fragment identifier
    recoverStateFromURI();

    if (state.view !== oldView) {

        document.dispatchEvent(new Event("updateView"));

    } else {

        // restore filtering and sorting state of the data
        applyState();

        // body can be rendered now
        renderBody();
    }

}, false);


// fire custom event that should be implemented in 'data.js' and should populate 'yaml.files'
document.dispatchEvent(new Event("initSrc"));

// load all YAML resources (as defined in yaml.files) asynchronously
// wait until all requests are done using Promise.all() technique
// if all requests were successful, then call init(), otherwise call reportError()
Promise.all([["specs", "specs.yml"], ...Object.entries(yaml.files)].map(f => getYaml(...f))).then(init, reportError);


// the variables and functions shared between the modules
export {state, yaml, data, display};
