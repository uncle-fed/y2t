function badbrowser() {
    document.getElementsByTagName("body")[0].innerHTML = "<p id=\"error\">Something went terribly wrong.<br />Oh, never mind, it's just the web browser you're using.</p>";
}

if (document.attachEvent ? document.readyState === "complete" : document.readyState !== "loading") {
    badbrowser();
} else {
    document.addEventListener("DOMContentLoaded", badbrowser);
}
