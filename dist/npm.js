/*
 BASED ON: http://louisstow.github.io/WebRTC/datachannels.html
 */

var dcCounter = 0;
var activeChannelCount = new Array();
var parameters = {};
var labelButtonToggle = false;
var t_startNewPackage = 0;
var offerer = false;
var npmSizetemp = 0;

// get a reference to our FireBase database and child element: rooms
var dbRef = new Firebase("https://webrtc-data-channel.firebaseio.com/");
var roomRef = dbRef.child("rooms");

// shims - wrappers for webkit and mozilla connections
var PeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
var IceCandidate = window.mozRTCIceCandidate || window.RTCIceCandidate;
var SessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.RTCSessionDescription;


// #### Functions
// generate a unique-ish string for storage in firebase
function id() {
	return (Math.random() * 10000 + 10000 | 0).toString();
}

// wrapper to send data to FireBase
// - room: 	room id - generated by id()-function or read from url
function send(room, key, data) {
	roomRef.child(room).child(key).set(data);
}

// wrapper function to receive data from FireBase
function recv(room, type, cb) {
	roomRef.child(room).child(type).on("value", function(snapshot, key) {
		var data = snapshot.val();
		if (data) {
			cb(data);
		}
	});
}

// generic error handler
function errorHandler(err) {
	console.error(err);
}

// determine what type of peer we are,
// offerer or answerer.
var ROOM = location.hash.substr(1);
var type = "answerer";
var otherType = "offerer";

// no room number specified, so create one
// which makes us the offerer
if (!ROOM) {
	ROOM = id();
	type = "offerer";
	otherType = "answerer";
	$('#link').append(" (offerer) - <a href='#" + ROOM + "'>" + ROOM + "</a>");
	$('#dcStatusAnswerer').hide();
}

if (type === "answerer") {
	$('#link').append(" (answerer) - " + ROOM);
	$('div.npmControlContainer').hide();
	
};

// options for the PeerConnection
var iceServer = {
	iceServers : [{
		url : "stun:23.21.150.121"
	}, {
		url : "stun:stun.l.google.com:19302"
	}, {
		url : "turn:numb.viagenie.ca",
		credential : "webrtcdemo",
		username : "louis%40mozilla.com"
	}]
};

// create the PeerConnection
var pc = new PeerConnection(iceServer);

pc.onicecandidate = function(e) {
	// take the first candidate that isn't null
	if (!e.candidate) {
		return;
	}
	pc.onicecandidate = null;

	// request the other peers ICE candidate
	recv(ROOM, "candidate:" + otherType, function(candidate) {
		pc.addIceCandidate(new IceCandidate(JSON.parse(candidate)));
	});

	// send our ICE candidate
	send(ROOM, "candidate:" + type, JSON.stringify(e.candidate));
	
	updatePeerConnectionState(event);
};

pc.onsignalingstatechange  = function(event) {
	updatePeerConnectionState(event);
};

pc.oniceconnectionstatechange = function(event) {
	updatePeerConnectionState(event);
};

// constraints on the offer SDP.
var constraints = {};

// define the channel var
var channels = new Object();

connect();

// start start peer connection
function connect() {
	if (type === "offerer") {
		offerer = true;
		$('#createDataChannel').prop("disabled", false);
		// Button "createDataChannel" anabled for offerer
		createDataChannel('init');
		// create the offer SDP
		pc.createOffer(function(offer) {
			pc.setLocalDescription(offer);

			// send the offer SDP to FireBase
			send(ROOM, "offer", JSON.stringify(offer));

			// wait for an answer SDP from FireBase
			recv(ROOM, "answer", function(answer) {
				pc.setRemoteDescription(new SessionDescription(JSON.parse(answer)));
			});
		}, errorHandler, constraints);

		console.log("creating offer");

	} else {
		offerer = false;
		$('#createDataChannel').prop("disabled", true);
		// Button "createDataChannel" disabled for answerer

		// answerer must wait for the data channel
		pc.ondatachannel = function(e) {
			var channel = e.channel;
			bindEvents(channel);

			console.log('incoming datachannel');


			channels[channel.label] = {
				channel: channel,
				statistics : {
					t_start 			: 0,
					t_end 				: 0,
					t_last				: 0,
					npmPktRx 			: 0,
					npmPktTx			: 0,
					npmBytesRx 			: 0,
					npmBytesTx			: 0,
					npmBytesRxLast		: 0,
					npmSize 			: 0,
					npmParameterSleep 	: 500,
					npmPackagecount 	: 10,
					npm1SizePerX 		: 0,
					npm1SizePerX2		: 0,
					npm1SizePerX3		: 0,
				}
			};
			updateChannelState();
		};

		// answerer needs to wait for an offer before
		// generating the answer SDP
		recv(ROOM, "offer", function(offer) {
			pc.setRemoteDescription(new SessionDescription(JSON.parse(offer)));

			// now we can generate our answer SDP
			pc.createAnswer(function(answer) {
				pc.setLocalDescription(answer);

				// send it to FireBase
				send(ROOM, "answer", JSON.stringify(answer));
			}, errorHandler, constraints);
		});
		console.log('connect passive');
	}
}

//Create Datachannels
function createDataChannel(label) {
	// 	

	var dataChannelOptions;
	if(typeof parameters[label] != 'undefined'){
		switch(parameters[label].reliableMethode){
			case "reliable":
				dataChannelOptions = {
				};
				break;
			case "maxRetransmit":
				dataChannelOptions = {
					maxRetransmits		: parameters[label].reliableParam,
				};
				break;
			case "maxTimeout":
				dataChannelOptions = {
					maxRetransmitTime	: parameters[label].reliableParam,
				};
				break;
		}
	}
		

	// offerer creates the data channel
	var tempChannel = pc.createDataChannel(label, dataChannelOptions);
	bindEvents(tempChannel);
	
	channels[tempChannel.label] = {
		channel : tempChannel,
		statistics: {
			t_start 			: 0,
			t_end 				: 0,
			npmPktRx 			: 0,
			npmPktTx			: 0,
			npmBytesRx 			: 0,
			npmBytesTx			: 0,
			npmSize 			: 0,
			npmParameterSleep 	: 500,
			npmPackagecount 	: 10,
			npm1SizePerX 		: 0,
			npm1SizePerX2		: 0,
			npm1SizePerX3		: 0,
		}
		
	};
	updateChannelState();
	console.log("datachannel created - label:" + tempChannel.id + ', id:' + tempChannel.label);
}

function closeDataChannel(label) {
	channels[label].channel.close();
}

function NpmSend(label, message) {
	// console.log("datachannel send - label:" + label + ' - sleep:' + parameters[label].sleep);
	try {
		channels[label].channel.send(message);
		//channels[activeChannelCount[i]].statistics.npmBytesTx += message.length;
		if (channels[label].statistics.npmPktTx <= parameters[label].pktCount) {
			channels[label].statistics.npmPktTx++;
			setTimeout(function(){
				NpmSend(label,message);
			}, parameters[label].sleep);
		} else {
			alert(channels[activeChannelCount[i]].statistics.npmBytesTx);
			channels[label].channel.close();
		}
	} catch(e) {
		alert("Test Aborted!");
		console.log(e);
		return;
	}
	//updateChannelState();
};

function funct() {
};

//
function parseParameters(){
	

	$('#npmControl > tbody > tr').each(function(){	
		parameters[$(this).find('button[name="toggleActive"]').val()] = {

			active: 		$(this).find('button[name="toggleActive"]').hasClass("btn-primary"),
			label:  		$(this).find('button[name="toggleActive"]').val(),
			pktSize: 		$(this).find('input[name="paramPktSize"]').val(),
			pktCount: 		$(this).find('input[name="paramPktCount"]').val(),
			sleep: 			$(this).find('input[name="paramSleep"]').val(),
			reliableMethode:$(this).find('button.dropdown-toggle').data('method'),
			reliableParam:  $(this).find('input[name="paramReliable"]').val()
		
		};
	});
}

//
function NetPerfMeter() {	
	var channelNo = -1;
	var accc = 0;

	parseParameters();

	for(var key in parameters){
		if (parameters.hasOwnProperty(key)) {
			if(parameters[key].active == true){
				createDataChannel(key);
				activeChannelCount[accc] = key;
				accc++;
			}
		}
	}
	
	
}
//
function netPerfMeterRunByTrigger(label){


	for(var i = 0; i < activeChannelCount.length; i++){			
		if(activeChannelCount[i] == label) {
			var DataArray = new Array(1, parameters[activeChannelCount[i]].sleep, parameters[activeChannelCount[i]].pktSize, parameters[activeChannelCount[i]].pktCount);
			var DataString = DataArray.join(";");
			channels[activeChannelCount[i]].channel.send(DataString);
			channels[activeChannelCount[i]].statistics.npmBytesTx = (1 + parameters[activeChannelCount[i]].sleep.length + parameters[activeChannelCount[i]].pktSize.length + parameters[activeChannelCount[i]].pktCount.length);
			
			npmPaket = "";
			for (var j = 0; j < parameters[activeChannelCount[i]].pktSize; j++) {
				npmPaket += "a";
			}
			NpmSend(activeChannelCount[i], npmPaket);
		}

	}
}

// bind the channel events
function bindEvents(channel) {
	channel.onopen = function() {
		console.log("datachannel opened - label:" + channel.label + ', ID:' + channel.id);
		updateChannelState();
		if(offerer == true){
			netPerfMeterRunByTrigger(channel.label);
		}
	};

	channel.onclose = function(e) {
		console.log("datachannel closed - label:" + channel.label + ', ID:' + channel.id);
		updateChannelState();
	};

	window.onbeforeunload = function() {
		channel.close();
	};

	channel.onmessage = function(e) {
		if(offerer == false){
			answererOnMessage(e);
		}
	};
}


function answererOnMessage(e){		
	rxData = e.data.toString();
	// console.log("Message for "+e.currentTarget.label + " - content:" + rxData.length);
	var tempChannelLabel = e.currentTarget.label;
	var rxnpmPaketTemp = rxData.split(";");

	if (rxnpmPaketTemp[0] == 1) {
		messageencoder = 1;
	} else
		messageencoder = 2;

	switch(messageencoder) {
		case 1:
			channels[tempChannelLabel].statistics.npmSizePerX 		= 0; 
			channels[tempChannelLabel].statistics.npmPktRx 			= 0; 
			channels[tempChannelLabel].statistics.npmPackagecount 	= 0;
			
			var rxDataString = rxData;
			var rxDataArray = rxDataString.split(";");
			
			channels[tempChannelLabel].statistics.npmParameterSleep 	= parseInt(rxDataArray[1]);
			channels[tempChannelLabel].statistics.npmSize 				= parseInt(rxDataArray[2]);
			npmSizetemp = channels[tempChannelLabel].statistics.npmSize;
			channels[tempChannelLabel].statistics.npmPackagecount 		= rxDataArray[3];

			channels[tempChannelLabel].statistics.t_start = new Date().getTime();
			break;
		case 2:
			channels[tempChannelLabel].statistics.t_end = new Date().getTime();
			channels[tempChannelLabel].statistics.npmBytesRx += rxData.length;
			channels[tempChannelLabel].statistics.npmPktRx++;

			// var returnArray	= 	calculation(
									// channels[tempChannelLabel].statistics.npmSize, 
									// npmSizetemp, 
									// channels[tempChannelLabel].statistics.t_start, 
									// channels[tempChannelLabel].statistics.t_end, 
									// t_startNewPackage, 
									// tempChannelLabel
								// );
			// channels[tempChannelLabel].statistics.npmSize = returnArray[0];
			// npmSizetemp = returnArray[1];
// 
			// channels[tempChannelLabel].statistics.npmSize = channels[tempChannelLabel].statistics.npmSize + npmSizetemp;
			// t_startNewPackage = new Date().getTime();
			
			break;
	}
}

function calculation(size, sizetemp, start, end, startNewPackage, channelLabel) {
	channels[channelLabel].statistics.npmSize = parseInt(size);
	npmSizetemp = parseInt(sizetemp);
	channels[channelLabel].statistics.t_start = parseInt(start);
	channels[channelLabel].statistics.t_end = parseInt(end);
	t_startNewPackage = parseInt(startNewPackage);

	//t_duration musst > 0
	t_duration = channels[channelLabel].statistics.t_end - channels[channelLabel].statistics.t_start;
	if (t_duration < 1)
		t_duration = 1;

	//calculate the average of Byte/s
	channels[channelLabel].statistics.npmSizePerX 	= parseFloat((channels[channelLabel].statistics.npmSize * (1 / (t_duration / 1000))) / 1024);
	channels[channelLabel].statistics.npmSizePerX 	= parseFloat(channels[channelLabel].statistics.npmSizePerX * 1000);
	channels[channelLabel].statistics.npmSizePerX2 	= Math.round(channels[channelLabel].statistics.npmSizePerX);
	channels[channelLabel].statistics.npmSizePerX2 	= channels[channelLabel].statistics.npmSizePerX2 / 1000;
	channels[channelLabel].statistics.npmSizePerX3 	= (channels[channelLabel].statistics.npmSizePerX2 / 1024) * 1000000;
	channels[channelLabel].statistics.npmSizePerX3 	= Math.round(channels[channelLabel].statistics.npmSizePerX3);
	channels[channelLabel].statistics.npmSizePerX3 	= channels[channelLabel].statistics.npmSizePerX3 / 1000000;

	//calculazion of the current Byte/s
	channels[channelLabel].statistics.npmSizePerX = (Math.round(((npmSizetemp * (1 / ((channels[channelLabel].statistics.t_end - t_startNewPackage) / 1000))) / 1024) * 1000)) / 1000;
	return [channels[channelLabel].statistics.npmSize, npmSizetemp];
}
