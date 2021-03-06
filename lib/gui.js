'use strict';

var {
  Cc, Ci
} = require('chrome');
var cm = require('sdk/context-menu');
var clipboard = require('sdk/clipboard');
var l10n = require('sdk/l10n').get;
var gw = require('./gateways.js');
var pin = require('./pin.js').pin;
var prefs = require('sdk/simple-prefs').prefs;
var panels = require('sdk/panel');
var tabs = require('sdk/tabs');
var data = require('sdk/self').data;

/*
 * PANEL & BUTTON
 */

var panel = panels.Panel({
  contentURL: data.url('panel.html'),
  contentScriptFile: data.url('panel.js'),
  onHide: buttonPanelHide
});

exports.toggleButtonPanel = panel;

var {
  ToggleButton
} = require('sdk/ui/button/toggle');

const ON_STATE = {
  icon: {
    '16': './icon-on-16.png',
    '32': './icon-on-32.png',
    '64': './icon-on-64.png'
  },
  badge: 'ON',
  badgeColor: '#4A9EA1'
};

const OFF_STATE = {
  icon: {
    '16': './icon-off-16.png',
    '32': './icon-off-32.png',
    '64': './icon-off-64.png'
  },
  badge: 'OFF',
  badgeColor: '#8C8C8C'
};

const button = new ToggleButton({
  id: 'ipfs-gateway-status',
  label: l10n('toggle_button_label'),
  icon: {
    '16': './icon-on-16.png',
    '32': './icon-on-32.png',
    '64': './icon-on-64.png'
  },
  onChange: buttonPanelShow
});

function buttonPanelShow(state) {
  if (state.checked) {
    panel.show({
      position: button
    });
  }
}

function buttonPanelHide() {
  button.state('window', {checked: false});
}

exports.toggleButton = button;


function toggle(val) { /*jshint ignore:line*/
  let newState = val ? ON_STATE : OFF_STATE;

  Object.keys(newState).forEach((k) => {
    button[k] = newState[k];
  });

  gw.toggle(val);
}

/*
 * COMMON (PANEL & CONTEXT MENU)
 */
function getCurrentURI() {
  return Cc['@mozilla.org/appshell/window-mediator;1']
    .getService(Ci.nsIWindowMediator)
    .getMostRecentWindow('navigator:browser')
    .getBrowser().currentURI;
}
function pinCurrentIpfsAddress() {
  pin(getCurrentURI().spec.replace(gw.customUri().spec, '/'));
}

function copyCurrentIpfsAddress() {
  clipboard.set(getCurrentURI().spec.replace(gw.customUri().spec, '/'));
}
exports.copyCurrentIpfsAddress = copyCurrentIpfsAddress;

function copyCurrentPublicGwUrl() {
  clipboard.set(getCurrentURI().spec.replace(gw.customUri().spec, gw.publicUri().spec));
}
exports.copyCurrentPublicGwUrl = copyCurrentPublicGwUrl;

/*
 * PANEL EVENTS
 */

// Outgoing

// Send "show" event to the panel's script, so the
// script can prepare the panel for display.
panel.on('show', function() {
  // inform panel if current page is an IPFS resource
  panel.port.emit('show', getCurrentURI().spec.match(gw.IPFS_RESOURCE) != null);
});


// Incoming (from panel's content script)

// Wrapper to provide UX fix:
// we want panel to hide after each action
function hidePanelAnd(funct) {
  return function() {
    panel.hide();
    funct();
  };
}

panel.port.on('toggle-gateway-redirect', hidePanelAnd(function() {
  toggle(!gw.isEnabled());
}));
panel.port.on('open-webui', hidePanelAnd(function() {
  let WEBUI_URI = 'http://' + prefs.customGatewayHost + ':' + prefs.customApiPort + '/webui';
  tabs.open(WEBUI_URI);
}));
panel.port.on('pin-current-ipfs-address', hidePanelAnd(pinCurrentIpfsAddress));
panel.port.on('copy-current-ipfs-address', hidePanelAnd(copyCurrentIpfsAddress));
panel.port.on('copy-current-public-gw-url', hidePanelAnd(copyCurrentPublicGwUrl));

/*
 * CONTEXT MENU ITEMS
 */

const PIN_IPFS_ADDRESS = cm.Item({
  label: 'Pin IPFS resource',
  contentScript: 'self.on("click", self.postMessage);',
  onMessage: pinCurrentIpfsAddress
});

const COPY_IPFS_ADDRESS = cm.Item({
  label: 'Copy canonical address',
  contentScript: 'self.on("click", self.postMessage);',
  onMessage: copyCurrentIpfsAddress
});

const COPY_PUBLIC_HTTP_URL = cm.Item({
  label: 'Copy Public Gateway URL',
  contentScript: 'self.on("click", self.postMessage);',
  onMessage: copyCurrentPublicGwUrl
});

cm.Menu({
  label: 'IPFS',
  items: [PIN_IPFS_ADDRESS, COPY_IPFS_ADDRESS, COPY_PUBLIC_HTTP_URL]
});


gw.onChange(() => {
  for (let ctx of[PIN_IPFS_ADDRESS.context, COPY_PUBLIC_HTTP_URL.context, COPY_IPFS_ADDRESS.context]) {
    let url = gw.customUri().spec + '*';
    ctx.add(cm.URLContext(url));
  }
  toggle(gw.isEnabled());
});

toggle(gw.isEnabled());
