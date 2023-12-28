import * as k8s from '@kubernetes/client-node';

const debugMode = process.env.DEBUG_MODE || 'false';
let applyingScheduled = false;

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const k8sCoreApi = kc.makeApiClient(k8s.CoreV1Api);
const watch = new k8s.Watch(kc);

async function onEvent(phase, obj) {
  log(`Received event in phase ${phase}.`);
  if (phase == 'ADDED') {
    scheduleApplying(obj);
  } else if (phase == 'MODIFIED') {
    try {
      scheduleApplying(obj);
    } catch (err) {
      log(err);
    }
  } else if (phase == 'DELETED') {
    // await deleteResource(obj, k8sCoreApi);
    console.log('Got delete event');
  } else {
    log(`Unknown event type: ${phase}`);
  }
}

function onDone(err) {
  log(`Connection closed. ${err}`);
  watchResource();
}

async function watchResource() {
  log('Watching API');
  return watch.watch(
    '/apis/qdrant.operator/v1alpha1',
    {},
    onEvent,
    onDone
  );
}

function scheduleApplying(obj) {
  if (!applyingScheduled) {
    setTimeout(applyNow, 1000, obj);
    applyingScheduled = true;
  }
}

async function applyNow(obj) {
  applyingScheduled = false;
  //applySecret(obj, k8sCoreApi, privateKey);
  console.log(obj);
}

async function main() {
  await watchResource();
}

export function log(message) {
  console.log(`${new Date().toLocaleString()}: ${message}`);
}

if (debugMode == 'true') {
  log('Debug mode ON!');
  process.on('unhandledRejection', (reason, p) => {
    console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
  });
}

const privateKey = await getPrivateKey(k8sCoreApi);

main();
