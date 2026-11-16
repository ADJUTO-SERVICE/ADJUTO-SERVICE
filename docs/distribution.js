'use strict';

const distributionDialog = $('distribution-dialog');
const distributionForm = $('distribution-form');
const distributionInput = $('distribution-file');
const distributionPreview = $('distribution-preview');
const distributionSave = $('distribution-save');
let distributionCandidate = null;
let distributionLayer = null;
let distributionRead = 0;
let distributionSaving = false;

function distributionSummary(record, distance = '') {
  const format = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', dateStyle: 'medium', timeStyle: 'medium'
  });
  const start = record.startedAt === null ? '不明' : format.format(record.startedAt);
  const end = record.endedAt === null ? '不明' : format.format(record.endedAt);
  return `${record.pointCount.toLocaleString('ja-JP')}地点 · GPX計算 ${(record.meters / 1000).toFixed(3)} km · Strava表示 ${distance || '未入力'} · 記録日時（日本時間） ${start} ～ ${end}`;
}

function clearDistributionPreview() {
  if (distributionLayer) distributionLayer.remove();
  distributionLayer = null;
  $('distribution-open').textContent = '配布GPXを登録';
}

function resetDistribution() {
  distributionRead++;
  distributionCandidate = null;
  distributionForm.reset();
  distributionPreview.disabled = true;
  distributionSave.disabled = true;
  $('distribution-summary').textContent = 'ファイルを選んでください。';
  clearDistributionPreview();
}

$('distribution-open').onclick = () => {
  if (distributionLayer) {
    distributionDialog.showModal();
    return;
  }
  if (!map || formDirty || !leaveAllowed()) {
    toast('地図の準備を確認し、編集中の記録を保存してから開いてください。');
    return;
  }
  resetDistribution();
  distributionDialog.showModal();
};

$('distribution-cancel').onclick = () => {
  if (distributionSaving) return;
  resetDistribution();
  distributionDialog.close();
};

distributionDialog.addEventListener('cancel', event => {
  event.preventDefault();
  $('distribution-cancel').click();
});

distributionInput.onchange = async () => {
  const read = ++distributionRead;
  const file = distributionInput.files[0];
  distributionCandidate = null;
  clearDistributionPreview();
  distributionPreview.disabled = true;
  distributionSave.disabled = true;
  const summary = $('distribution-summary');
  summary.textContent = '読み込み中…';
  try {
    if (!file) {
      summary.textContent = 'ファイルを選んでください。';
      return;
    }
    if (file.size > 10000000) throw Error('GPXは10MB以下にしてください。');
    const bytes = await file.arrayBuffer();
    const parsed = AdjutoGPX.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes), {distribution: true});
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const sha256 = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
    const original = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    if (read !== distributionRead) return;
    if (state.entries.some(entry => entry.distribution?.sha256 === sha256)) {
      throw Error('同じGPXはすでに登録されています。');
    }
    const record = {
      name: file.name, original, sha256, meters: parsed.meters, pointCount: parsed.total,
      startedAt: parsed.startedAt, endedAt: parsed.endedAt
    };
    distributionCandidate = {record, parts: parsed.parts};
    const fields = distributionForm.elements;
    fields.namedItem('name').value = parsed.name || file.name.slice(0, 100);
    if (record.startedAt !== null) {
      fields.namedItem('date').value = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(record.startedAt);
      fields.namedItem('planned').value = C.addDays(fields.namedItem('date').value);
    }
    summary.textContent = distributionSummary(record) +
      (parsed.isolated ? ` · 孤立した${parsed.isolated}点は元GPXに保持します。` : '');
    distributionPreview.disabled = false;
    distributionSave.disabled = false;
  } catch (error) {
    if (read === distributionRead) summary.textContent = '読込失敗：' + error.message;
  }
};

distributionPreview.onclick = () => {
  if (!distributionCandidate) return;
  clearDistributionPreview();
  const {parts} = distributionCandidate;
  distributionLayer = L.polyline(parts, {color: '#188447', weight: 6, interactive: false}).addTo(map);
  distributionDialog.close();
  $('distribution-open').textContent = 'GPXの登録へ戻る';
  map.fitBounds(distributionLayer.getBounds(), {padding: [24, 24], maxZoom: 18});
  $('map').closest('.map-panel').scrollIntoView({block: 'start'});
};

distributionForm.onsubmit = async event => {
  event.preventDefault();
  if (!distributionCandidate || distributionSaving) return;
  distributionSaving = true;
  const values = new FormData(distributionForm);
  const controls = [...distributionForm.elements];
  controls.forEach(control => control.disabled = true);
  const summary = $('distribution-summary');
  try {
    const {record, parts} = distributionCandidate;
    await writeQueue;
    if (!db || formDirty || mode || trackDraft || gpsBusy()) {
      throw Error('編集中の記録を保存し、端末内保存を確認してください。');
    }
    const value = key => String(values.get(key) || '').trim();
    if (!value('partner') || !value('region')) throw Error('担当者と地域を入力してください。');
    if (value('type') !== 'normal' && !value('planned')) throw Error('回収予定日を入力してください。');
    const entry = {
      id: 'distribution-' + record.sha256, name: value('name'), region: value('region'),
      date: value('date'), partner: value('partner'), planned: value('planned'), plannedAuto: false,
      types: value('type') === 'both' ? ['normal', 'free'] : [value('type')],
      distance: value('distance') ? value('distance') + ' km' : '',
      distribution: record, center: parts[0][0],
      segments: parts.map((points, index) => ({
        id: 'distribution-' + index, points, confidence: 'confirmed', reason: 'GPXの徒歩配布軌跡'
      }))
    };
    const before = state;
    const next = C.validate({version: 2, entries: [...before.entries, entry]});
    const saved = await new Promise((resolve, reject) => {
      const transaction = db.transaction('records', 'readwrite');
      const records = transaction.objectStore('records');
      const request = records.get('state');
      let conflict;
      request.onsuccess = () => {
        try {
          if (JSON.stringify(request.result && C.validate(request.result)) !== JSON.stringify(C.validate(before))) {
            throw Error('保存済みデータが更新されています。画面を再読み込みしてください。');
          }
          records.put(before, 'before-distribution-import');
          records.put(next, 'state');
        } catch (error) {
          conflict = error;
          transaction.abort();
        }
      };
      transaction.oncomplete = () => resolve(next);
      transaction.onabort = () => reject(conflict || transaction.error || Error('保存中断'));
      transaction.onerror = () => reject(transaction.error || Error('保存失敗'));
    });
    state = saved;
    selected = entry.id;
    resetDistribution();
    distributionDialog.close();
    $('show-distribution').checked = true;
    ['search', 'type-filter', 'status-filter'].forEach(id => {
      $(id).value = id === 'search' ? '' : 'all';
      $(id).dataset.previous = $(id).value;
    });
    $('save-state').textContent = '端末に保存済み';
    render();
    fitRoutes();
    toast('配布GPXをこの端末に登録しました。');
  } catch (error) {
    summary.textContent = '登録失敗：' + error.message;
  } finally {
    distributionSaving = false;
    controls.forEach(control => control.disabled = false);
    distributionPreview.disabled = !distributionCandidate;
    distributionSave.disabled = !distributionCandidate;
  }
};

$('gpx-original').onclick = () => {
  const record = current()?.distribution;
  if (!record) return;
  const bytes = Uint8Array.from(atob(record.original), character => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], {type: 'application/gpx+xml'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = record.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};

$('show-distribution').onchange = renderMap;

let locationWatch = null;
let locationGeneration = 0;
let locationMarker = null;
const locationToggle = $('location-toggle');
const locationCenter = $('location-center');
const locationFeedback = $('location-feedback');

function stopLocation() {
  ++locationGeneration;
  if (locationWatch !== null) navigator.geolocation.clearWatch(locationWatch);
  locationWatch = null;
  if (locationMarker) locationMarker.remove();
  locationMarker = null;
  locationToggle.textContent = '現在地 OFF';
  locationToggle.setAttribute('aria-pressed', 'false');
  locationCenter.hidden = true;
  locationFeedback.hidden = true;
}

locationCenter.onclick = () => {
  if (locationMarker) map.setView(locationMarker.getLatLng(), Math.max(map.getZoom(), 16));
};

locationToggle.onclick = () => {
  if (locationWatch !== null) {
    stopLocation();
    return;
  }
  locationFeedback.hidden = false;
  if (!map || !window.isSecureContext || !navigator.geolocation) {
    locationFeedback.textContent = '現在地を取得できません。SafariでHTTPSの地図を開いてください。';
    return;
  }
  locationFeedback.textContent = '現在地を取得中…';
  locationToggle.textContent = '現在地 ON';
  locationToggle.setAttribute('aria-pressed', 'true');
  const generation = ++locationGeneration;
  locationWatch = navigator.geolocation.watchPosition(position => {
    if (generation !== locationGeneration) return;
    const point = [position.coords.latitude, position.coords.longitude];
    if (locationMarker) locationMarker.setLatLng(point);
    else {
      locationMarker = L.circleMarker(point, {
        radius: 8, color: '#fff', weight: 3, fillColor: '#1554a5', fillOpacity: 1,
        interactive: false
      }).addTo(map);
      locationCenter.hidden = false;
    }
    locationFeedback.textContent = `現在地の精度 約${Math.round(position.coords.accuracy)} m`;
  }, error => {
    if (generation !== locationGeneration) return;
    stopLocation();
    locationFeedback.hidden = false;
    locationFeedback.textContent = error.code === 1
      ? '位置情報が許可されていません。SafariのWebサイト設定で許可してください。'
      : '現在地を取得できませんでした。位置情報と通信を確認して、もう一度押してください。';
  }, {enableHighAccuracy: true, maximumAge: 0, timeout: 12000});
};

window.addEventListener('pagehide', stopLocation);
window.addEventListener('beforeunload', event => {
  if (!distributionCandidate) return;
  event.preventDefault();
  event.returnValue = '';
});
