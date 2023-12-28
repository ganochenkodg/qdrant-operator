import * as k8s from '@kubernetes/client-node';

const debugMode = process.env.DEBUG_MODE || 'false';
let applyingScheduled = false;

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const k8sCoreApi = kc.makeApiClient(k8s.CoreV1Api);
const watch = new k8s.Watch(kc);

const onEvent = async(phase, obj) => {
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

const onDone = (err) => {
  log(`Connection closed. ${err}`);
  watchResource();
}

const watchResource = async() => {
  log('Watching API');
  return watch.watch(
    '/apis/qdrant.operator/v1alpha1',
    {},
    onEvent,
    onDone
  );
}

const scheduleApplying = (obj) => {
  if (!applyingScheduled) {
    setTimeout(applyNow, 1000, obj);
    applyingScheduled = true;
  }
}

const applyNow = async(obj) => {
  applyingScheduled = false;
  //applySecret(obj, k8sCoreApi, privateKey);
  console.log(obj);
}

const main = async () => {
  await watchResource();
}

export const log = (message) => {
  console.log(`${new Date().toLocaleString()}: ${message}`);
}

if (debugMode == 'true') {
  log('Debug mode ON!');
  process.on('unhandledRejection', (reason, p) => {
    console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
  });
}

main();
