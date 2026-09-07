import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const baseUrl = process.env.GUIDE_CAPTURE_URL || 'https://travel.whales-teatime.workers.dev';
const captureMode = process.env.GUIDE_CAPTURE_MODE || 'all';
const outputDir = path.resolve('public/guide');
const workDir = mkdtempSync(path.join(tmpdir(), 'travel-note-guide-'));
const profileDir = path.join(workDir, 'chrome-profile');
const debugPort = 9338;

mkdirSync(outputDir, { recursive: true });

const tripSettings = {
  title: '전주 친구 여행', destination: '전주', startDate: '2026-09-19', endDate: '2026-09-20', people: 5, editPolicy: 'owner',
};
const stops = [
  { id: 'guide-1', day: '2026-09-19', time: '09:00', name: '전주역', category: '기타', memo: '전주 도착', address: '전북특별자치도 전주시 덕진구 동부대로 680', lat: 35.84943, lng: 127.1618 },
  { id: 'guide-2', day: '2026-09-19', time: '12:30', name: '전주한옥마을', category: '관광', memo: '한옥 골목 산책', address: '전북특별자치도 전주시 완산구 기린대로 99', lat: 35.8149, lng: 127.1527 },
  { id: 'guide-3', day: '2026-09-19', time: '18:30', name: '전주남부시장', category: '식사', memo: '야시장 구경', address: '전북특별자치도 전주시 완산구 풍남문1길 19-3', lat: 35.8122, lng: 127.1478 },
];

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

class CdpClient {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.socket = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Chrome did not answer ${method} within 20 seconds.`));
      }, 20_000);
      this.pending.set(id, {
        resolve: value => { clearTimeout(timer); resolve(value); },
        reject: error => { clearTimeout(timer); reject(error); },
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() { this.socket.close(); }
}

async function waitForJson(url, timeout = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await sleep(150);
  }
  throw new Error(`Chrome debugging endpoint did not open: ${url}`);
}

const chrome = spawn(chromePath, [
  '--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profileDir}`,
  '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  '--disable-background-networking', '--force-color-profile=srgb', 'about:blank',
], { stdio: 'ignore', windowsHide: true });

let client;
try {
  const version = await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
  client = new CdpClient(version.webSocketDebuggerUrl);
  await client.send('Target.setDiscoverTargets', { discover: true });
  const target = await client.send('Target.createTarget', { url: 'about:blank' });
  await client.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  client.close();

  const targets = await waitForJson(`http://127.0.0.1:${debugPort}/json/list`);
  const pageTarget = targets.find(item => item.id === target.targetId);
  if (!pageTarget?.webSocketDebuggerUrl) throw new Error('Could not attach to the guide capture tab.');
  client = new CdpClient(pageTarget.webSocketDebuggerUrl);
  await Promise.all([client.send('Page.enable'), client.send('Runtime.enable'), client.send('Network.enable')]);
  await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    try {
      localStorage.setItem('route-note-trip-settings', ${JSON.stringify(JSON.stringify(tripSettings))});
      localStorage.setItem('route-note-stops', ${JSON.stringify(JSON.stringify(stops))});
    } catch {}
  ` });

  const run = async expression => {
    const response = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || 'Browser evaluation failed.');
    return response.result?.value;
  };
  const waitFor = async (selector, timeout = 12_000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (await run(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return;
      await sleep(150);
    }
    throw new Error(`Timed out waiting for ${selector}`);
  };
  const visibleTextClick = async text => run(`(() => {
    const candidates=Array.from(document.querySelectorAll('button,a'));
    const element=candidates.find(node=>node.offsetParent!==null&&node.textContent?.replace(/\\s+/g,' ').trim().includes(${JSON.stringify(text)}));
    if(!element)return false;element.click();return true;
  })()`);
  const rectFor = async (selector, index = 0) => run(`(() => {
    const node=document.querySelectorAll(${JSON.stringify(selector)})[${index}];
    if(!node)return null;const rect=node.getBoundingClientRect();return {x:rect.x,y:rect.y,width:rect.width,height:rect.height};
  })()`);
  const focusSelector = async (selector, index = 0) => run(`(() => {
    const node=document.querySelectorAll(${JSON.stringify(selector)})[${index}];
    if(!node)return false;node.focus();node.click();return true;
  })()`);
  const typeCharacters = async (characters, frame) => {
    for (const character of characters) {
      await run(`(() => {
        const input=document.activeElement;
        if(!(input instanceof HTMLInputElement))return false;
        const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
        setter?.call(input,input.value+${JSON.stringify(character)});
        input.dispatchEvent(new InputEvent('input',{bubbles:true,data:${JSON.stringify(character)},inputType:'insertText'}));
        return true;
      })()`);
      await sleep(380);
      await frame(1);
    }
  };
  const setPointer = async (x, y, pressed = false) => run(`(() => {
    let pointer=document.getElementById('guide-capture-pointer');
    if(!pointer){pointer=document.createElement('div');pointer.id='guide-capture-pointer';pointer.innerHTML='<span></span>';document.body.append(pointer);}
    Object.assign(pointer.style,{display:'grid',left:${x}+'px',top:${y}+'px',transform:'translate(-4px,-3px) scale(${pressed ? '.84' : '1'})'});return true;
  })()`);
  const installPointer = async () => run(`(() => {
    const style=document.createElement('style');style.textContent='#guide-capture-pointer{position:fixed;z-index:2147483647;width:28px;height:28px;place-items:center;pointer-events:none;transition:left .16s ease,top .16s ease,transform .12s ease}#guide-capture-pointer span{display:block;width:0;height:0;border-top:18px solid #173b2a;border-right:11px solid transparent;filter:drop-shadow(0 2px 2px rgba(255,255,255,.9));transform:rotate(-28deg)}';document.head.append(style);return true;
  })()`);
  const navigate = async (width, height, mobile = false) => {
    await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await client.send('Page.navigate', { url: `${baseUrl}/plan/new?draft=1` });
    await waitFor('.workspace');
    await sleep(2_000);
    await installPointer();
  };
  const recorder = name => {
    const framesDir = path.join(workDir, name);
    mkdirSync(framesDir, { recursive: true });
    let index = 0;
    return {
      async frame(repeat = 1) {
        for (let count = 0; count < repeat; count += 1) {
          const shot = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
          writeFileSync(path.join(framesDir, `${String(index++).padStart(3, '0')}.png`), Buffer.from(shot.data, 'base64'));
        }
      },
      finish(width) {
        const result = spawnSync('ffmpeg', ['-y', '-framerate', '6', '-i', path.join(framesDir, '%03d.png'), '-vf', `fps=6,scale=${width}:-2:flags=lanczos`, '-loop', '0', '-c:v', 'libwebp', '-q:v', '72', '-compression_level', '5', path.join(outputDir, `${name}.webp`)], { stdio: 'inherit', windowsHide: true });
        if (result.status !== 0) throw new Error(`ffmpeg failed for ${name}`);
      },
    };
  };

  if (captureMode !== 'mobile') {
    console.log('Capturing PC guide animations...');
    await navigate(1280, 800, false);

  {
    const video = recorder('pc-search');
    const addRect = await rectFor('.wide-add');
    await setPointer(addRect.x + addRect.width / 2, addRect.y + addRect.height / 2);
    await video.frame(3);
    await visibleTextClick('이 날짜에 장소 추가');
    await waitFor('.add-dialog');
    await video.frame(3);
    const inputRect = await rectFor('.add-dialog .place-combobox-input');
    await setPointer(inputRect.x + 80, inputRect.y + inputRect.height / 2);
    await focusSelector('.add-dialog .place-combobox-input');
    await typeCharacters('전주역', video.frame.bind(video));
    await waitFor('.place-combobox-item');
    await video.frame(5);
    const optionRect = await rectFor('.place-combobox-item');
    await setPointer(optionRect.x + 110, optionRect.y + optionRect.height / 2, true);
    await video.frame(2);
    await run(`document.querySelector('.place-combobox-item')?.click()`);
    await sleep(350);
    await video.frame(6);
    video.finish(960);
    await visibleTextClick('취소');
    await sleep(300);
  }

  {
    const video = recorder('pc-reorder');
    const first = await rectFor('.stop-card', 0);
    const last = await rectFor('.stop-card', 2);
    await setPointer(first.x + 12, first.y + first.height / 2);
    await video.frame(4);
    await run(`(() => { const cards=[...document.querySelectorAll('.stop-card')];const transfer=new DataTransfer();cards[0].dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));return true; })()`);
    for (let step = 1; step <= 7; step += 1) {
      const progress = step / 7;
      const x = first.x + 12 + (last.x + 12 - first.x - 12) * progress;
      const y = first.y + first.height / 2 + (last.y + last.height / 2 - first.y - first.height / 2) * progress;
      await setPointer(x, y, true);
      if (step >= 5) await run(`(() => { const cards=[...document.querySelectorAll('.stop-card')];cards[cards.length-1].dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:new DataTransfer()}));return true; })()`);
      await video.frame(1);
    }
    await run(`(() => { const cards=[...document.querySelectorAll('.stop-card')];const target=cards[cards.length-1];target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:new DataTransfer()}));cards[0]?.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:new DataTransfer()}));return true; })()`);
    await sleep(450);
    await setPointer(last.x + 12, last.y + last.height / 2);
    await video.frame(7);
    video.finish(960);
  }

  {
    const video = recorder('pc-custom-pin');
    const buttonRect = await rectFor('.custom-add-button');
    await setPointer(buttonRect.x + buttonRect.width / 2, buttonRect.y + buttonRect.height / 2);
    await video.frame(3);
    await visibleTextClick('지도에 임의 핀 추가');
    await waitFor('.custom-dialog');
    await sleep(300);
    await video.frame(4);
    const placeOnMapRect = await rectFor('.custom-location-status button');
    await setPointer(placeOnMapRect.x + placeOnMapRect.width / 2, placeOnMapRect.y + placeOnMapRect.height / 2, true);
    await video.frame(2);
    await visibleTextClick('지도에서 위치 찍기');
    await waitFor('.map-location-editor');
    await sleep(350);
    await video.frame(4);
    const mapRect = await rectFor('.map-canvas');
    const mapX = mapRect.x + mapRect.width * .58;
    const mapY = mapRect.y + mapRect.height * .47;
    await setPointer(mapX, mapY, true);
    await video.frame(2);
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mapX, y: mapY, button: 'left', clickCount: 1 });
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mapX, y: mapY, button: 'left', clickCount: 1 });
    await sleep(900);
    await video.frame(5);
    const continueRect = await rectFor('.map-location-editor button');
    await setPointer(continueRect.x + continueRect.width / 2, continueRect.y + continueRect.height / 2, true);
    await video.frame(2);
    await visibleTextClick('이 위치로 계속');
    await waitFor('.custom-dialog');
    await sleep(350);
    await video.frame(6);
    video.finish(960);
    await visibleTextClick('취소');
  }

  }

  if (captureMode !== 'desktop') {
    console.log('Capturing mobile guide animations...');
    await navigate(430, 780, true);

  {
    const video = recorder('mobile-search');
    const addRect = await rectFor('.wide-add');
    await setPointer(addRect.x + addRect.width / 2, addRect.y + addRect.height / 2);
    await video.frame(3);
    await visibleTextClick('이 날짜에 장소 추가');
    await waitFor('.add-dialog');
    await video.frame(3);
    const inputRect = await rectFor('.add-dialog .place-combobox-input');
    await setPointer(inputRect.x + 90, inputRect.y + inputRect.height / 2);
    await focusSelector('.add-dialog .place-combobox-input');
    await typeCharacters('한옥마을', video.frame.bind(video));
    await waitFor('.place-combobox-item');
    await video.frame(5);
    const optionRect = await rectFor('.place-combobox-item');
    await setPointer(optionRect.x + 90, optionRect.y + optionRect.height / 2, true);
    await video.frame(2);
    await run(`document.querySelector('.place-combobox-item')?.click()`);
    await sleep(450);
    await video.frame(6);
    video.finish(430);
  }

  {
    await client.send('Page.navigate', { url: `${baseUrl}/plan/new?draft=1` });
    await waitFor('.workspace');
    await sleep(1_700);
    await installPointer();
    const video = recorder('mobile-map-focus');
    const mapRect = await rectFor('.map-canvas');
    const x = mapRect.x + mapRect.width * .65;
    const y = mapRect.y + mapRect.height * .55;
    await setPointer(x, y);
    await video.frame(4);
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(450);
    await video.frame(7);
    const toggleRect = await rectFor('.map-planner-toggle');
    if (toggleRect) {
      await setPointer(toggleRect.x + toggleRect.width / 2, toggleRect.y + toggleRect.height / 2, true);
      await video.frame(2);
      await visibleTextClick('일정 보기');
      await sleep(400);
      await video.frame(7);
    }
    video.finish(430);
  }

  }

  console.log('Guide animations captured:', outputDir);
} finally {
  client?.close();
  chrome.kill();
  await sleep(250);
  rmSync(workDir, { recursive: true, force: true });
}
