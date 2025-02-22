const socket = io();


const sendLocation = (latlng) => {
    console.log(`emit location ${latlng}`);
    socket.emit('location', latlng);
}


const saveConfig = (key, value) => {
    localStorage.setItem(`kinesis-${key}`, value);
}


const loadConfig = (key, fallback) => {
    const value = localStorage.getItem(`kinesis-${key}`);
    if (!value) {
        saveConfig(key, fallback);
    }
    return value ? value : fallback;
}


const center = L.latLng(loadConfig('latitude', 53.338228), loadConfig('longitude', -6.259323));


const map = L.map('map', {
    center: center,
    zoom: loadConfig('zoom', 12),
    doubleClickZoom: false,
});


const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);


// L.Routing.control({
//     waypoints: [
//         L.latLng(53.338228, -6.259323),
//         L.latLng(53.344275, -6.272076)
//     ],
//     routeWhileDragging: true
// }).addTo(map);


let marker = null;
let markerLastPos = null;
let markerShadowPos = null;

const path = L.polyline([], {color: 'red'}).addTo(map);
let stepIndex = 0; // index of next step of path
let speed = 1; // speed unit meter per second
let loop = 'off'; // off; loop; uturn
let pause = false;

const tickInterval = 1000; // update location per 1000ms
const randomFactor = 0.2; // +-20% of origin value


const tick = setInterval(function () {
    navigate();
}, tickInterval);


const updateRadio = (name, value) => {
    document.getElementsByName(name).forEach((element) => {
        element.checked = element.value == value;
    });
}


const setSpeed = (v) => {
    updateRadio('speedChoice', v);
    speed = v;
}
setSpeed(speed);


const setLoop = (v) => {
    updateRadio('loopChoice', v);
    loop = v;
}
setLoop(loop);


const setPause = (v) => {
    document.getElementById('pauseSwitch').checked = v;
    pause = v;
}
setPause(pause);

document.getElementById('undoButton').addEventListener('click', deleteStep);
document.getElementById('stopButton').addEventListener('click', clearSteps);

document.getElementById('pauseSwitch').addEventListener('change', () => {
    pause = document.getElementById('pauseSwitch').checked;
    console.log(`pause ${pause}`)
});

document.getElementsByName('speedChoice').forEach((element) => {
    element.addEventListener('click', () => {
        speed = element.value;
        console.log(`speed ${speed}`)
    });
});

document.getElementsByName('loopChoice').forEach((element) => {
    element.addEventListener('click', () => {
        loop = element.value;
        console.log(`loop ${loop}`);
    });
});

document.getElementById('applyButton').addEventListener('click', moveLocation);
document.getElementById('currentLocation').addEventListener('click', currentLocation);
document.getElementById('copyLocation').addEventListener('click', copyLocation);
document.getElementById('searchButton').addEventListener('click', searchKeyword);
document.getElementById('latlngInput').addEventListener('keyup', (e) => {
    if (e.keyCode == "13") moveLocation()
});
document.getElementById('keywordInput').addEventListener('keyup', (e) => {
    if (e.keyCode == "13") searchKeyword()
});


map.on('click', function (e) {
    if (!initMain(e.latlng)) {
        addStep(e.latlng);
    }
});

map.on('zoomend', function () {
    saveConfig('zoom', map.getZoom());
});

map.on('moveend', function () {
    const c = map.getCenter();
    saveConfig('latitude', c.lat);
    saveConfig('longitude', c.lng);
});


const random = (x) => {
    const factor = 1 + randomFactor * (Math.random() * 2 - 1);
    return x * factor;
}


// return true if initialized marker, false if already initialized
function initMain(latlng) {
    if (marker === null) {
        marker = L.marker(latlng, {draggable: true});
        if (teleport(latlng)) {
            marker.addTo(map);

            marker.on('mousedown', function (e) {
                markerLastPos = e.latlng;
            });

            marker.on('mouseup', function (e) {
                if (!teleport(e.latlng)) {
                    marker.setLatLng(markerLastPos);
                }
            });

        } else {
            // rollback so we can init it again
            marker = null;
        }
        return true;
    }
    return false
}


// return true if teleported, false if canceled teleportation
function teleport(latlng) {
    const choice = confirm(`${latlng} Teleport?`)
    if (choice) {
        marker.setLatLng(latlng);
        markerShadowPos = latlng;
        sendLocation(`${markerShadowPos.lat},${markerShadowPos.lng}`)
        clearSteps();
    }
    return choice;
}

// move towards target with distance meters
function move(target, distance) {
    if (distance != 0) {
        const start = markerShadowPos;
        const newPos = geolib.computeDestinationPoint(start, distance, geolib.getGreatCircleBearing(start, target))
        const newLatlng = L.latLng(newPos.latitude, newPos.longitude);

        // check if it's too far
        const dis1 = map.distance(start, target);
        const dis2 = map.distance(start, newLatlng);

        if (dis2 > dis1) {
            // we just move to destination
            markerShadowPos = target;
        } else {
            markerShadowPos = newLatlng;
        }
    }

    // set a random location
    const randomDistance = distance * randomFactor;
    const randomLocation = geolib.computeDestinationPoint(markerShadowPos, randomDistance, Math.random() * 360);
    const randomLatlng = L.latLng(randomLocation.latitude, randomLocation.longitude);

    sendLocation(`${randomLatlng.lat},${randomLatlng.lng}`)
    marker.setLatLng(randomLatlng);
}


function addStep(latlng) {
    console.log(`add ${latlng.lat},${latlng.lng}`);
    path.addLatLng(latlng);
}


function deleteStep() {
    const pathLatlngs = path.getLatLngs();
    if (pathLatlngs.length > 1 && stepIndex !== pathLatlngs.length - 1) {
        const deleted = pathLatlngs.pop();
        console.log(`deleted ${deleted.lat},${deleted.lng}`);
        path.setLatLngs([...pathLatlngs]);
    }
}

function clearSteps() {
    if (marker) {
        console.log(`clear path`);
        path.setLatLngs([marker.getLatLng()]);
        stepIndex = 0;
    }
}

function setLocation(latlng) {
    if (!initMain(latlng)) {
        teleport(latlng)
    }
    map.panTo(latlng)
}

function moveLocation() {
    const latlngInput = document.getElementById('latlngInput').value;
    if (latlngInput) {
        const latlngPaths = latlngInput.split(",")
        const latlng = L.latLng(latlngPaths[0], latlngPaths[1])
        setLocation(latlng)
    } else {
        alert("No location")
    }
}

function currentLocation() {
    navigator.geolocation.getCurrentPosition(function (location) {
        const latlngInput = document.getElementById('latlngInput');
        const latlng = new L.LatLng(location.coords.latitude, location.coords.longitude);
        latlngInput.value = `${latlng.lat},${latlng.lng}`
        setLocation(latlng)
    });
}

function copyLocation() {
    if (marker) {
        const latlng = marker.getLatLng()
        const location = `${latlng.lat},${latlng.lng}`
        navigator.clipboard.writeText(location)
            .then(() => {
                alert(`Location copied (${location})`)
            })
            .catch(err => {
                alert('Copy location failed');
            })
    }
}

function searchKeyword() {
    const latlngInput = document.getElementById('latlngInput');
    const keyword = document.getElementById("keywordInput").value;
    if (keyword) {
        var ps = new kakao.maps.services.Places()
        ps.keywordSearch(keyword, function (result, status) {
            console.log(result, status);
            if (status === kakao.maps.services.Status.OK) {
                const latlng = L.latLng(result[0].y, result[0].x)
                latlngInput.value = `${latlng.lat},${latlng.lng}`
                setLocation(latlng)
            } else {
                alert("No result")
            }
        });
    } else {
        alert("No keyword")
    }
}

function navigate() {
    const pathLatlngs = path.getLatLngs();
    if (stepIndex < pathLatlngs.length) {
        if (pause) {
            move(markerShadowPos, 0); // stay
        } else {
            const stepLatlng = pathLatlngs[stepIndex];
            // check if we're already at the goal
            if (stepLatlng.equals(markerShadowPos)) {
                // check if it's last step
                if (stepIndex >= pathLatlngs.length - 1) {
                    switch (loop) {
                        case 'loop':
                            console.log(`loop: move to start`);
                            stepIndex = 0;
                            break;
                        case 'uturn':
                            console.log(`loop: make uturn`);
                            path.setLatLngs([...pathLatlngs.reverse()]);
                            stepIndex = 1;
                            break;
                        case 'off':
                        default:
                            console.log(`loop: off`);
                            move(stepLatlng, 0); // stay
                            break;
                    }
                } else {
                    stepIndex += 1; // proceed with next step
                }
            } else {
                move(stepLatlng, random(speed) * tickInterval / 1000);
            }
        }
    }
}
