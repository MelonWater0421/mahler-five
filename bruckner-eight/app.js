/* Anton Bruckner · Symphony No. 8 in C minor (WAB 108) Interactive Guide
 * Robert Haas Edition (1890 Version with restored cuts)
 * Grounded in Pierre Boulez's X-Ray Contrapuntal Interpretation (Wiener Philharmoniker, DG 1996, St. Florian Abbey)
 * All playback is user initiated. Zero-build vanilla architecture.
 */
(()=>{
  'use strict';
  const D=window.BRUCKNER_DATA||window.MAHLER_DATA,E=window.BrucknerEngine||window.MahlerEngine,$=id=>document.getElementById(id),asset=path=>window.BRUCKNER_ASSETS?.[path]||path;
  const fmt=E.formatTime,esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const storageKey='bruckner-eight-atlas-v3';
  let saved={};try{saved=JSON.parse(localStorage.getItem(storageKey)||'{}')||{};}catch{}
  saved.bookmarks=(Array.isArray(saved.bookmarks)?saved.bookmarks:[]).map(key=>D.metadata?.bookmarkMigration?.[key]||key);
  const state={index:0,active:0,view:'map',filter:'all',follow:saved.follow!==false,continuous:saved.continuous!==false,bookmarks:Array.isArray(saved.bookmarks)?saved.bookmarks:[],calibrations:saved.calibrations||{},positions:saved.positions||{},theme:saved.theme==='light'?'light':'dark',speed:[.75,1,1.25].includes(saved.speed)?saved.speed:1,loop:null,manualUntil:0,lang:saved.lang==='en'?'en':'zh'};
  
  const t=(zh,en)=>state.lang==='en'?(en||zh):zh;
  const tr=(obj,field)=>{if(!obj)return '';if(state.lang==='en')return obj[field+'_en']||obj[field]||'';return obj[field]||'';};

  const sources=D.movements.map(m=>({url:asset(m.audio||`assets/movement-${m.id}.mp3`),key:m.audio||`assets/movement-${m.id}.mp3`,duration:m.duration,name:'Pierre Boulez · Wiener Philharmoniker (DG 1996)',custom:false}));
  const waves=new Map();let stages=[],toastTimer,hashBusy=false,loadSerial=0,pendingSeek=0,pendingReference=null,pendingAutoplay=false,playbackIntent=0,synthMode=0,synthNodes=[],synthGraph=[],synthTrackGains=[],synthSerial=0,synthCtx,synthFrame,synthPlaying=false,synthMuted={},telemetryKey='';
  const audio=$('audio');audio.volume=.65;audio.playbackRate=state.speed;
  const movement=()=>D.movements[state.index],source=()=>sources[state.index],calibration=()=>state.calibrations[source().key]||{};
  const store=()=>{try{localStorage.setItem(storageKey,JSON.stringify({follow:state.follow,continuous:state.continuous,bookmarks:state.bookmarks,calibrations:state.calibrations,positions:state.positions,theme:state.theme,speed:state.speed,lang:state.lang}));}catch{}};
  const isPlaying=()=>!audio.paused&&!audio.ended;
  const wantsPlayback=()=>isPlaying()||pendingAutoplay;
  const keyFor=(index,stageId)=>`${D.movements[index].id}-${stageId}`;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3600);}
  function closeDialog(){$('dialog').close();}
  function openDialog(title,body){$('dialogTitle').textContent=title;$('dialogBody').innerHTML=body;if(!$('dialog').open)$('dialog').showModal();}
  function mappedTime(base){return E.mapTime(base,movement().duration,source().duration,calibration());}
  function rebuildStages(){stages=E.mappedStages(movement(),source().duration,calibration());state.active=E.stageAt(stages,audio.currentTime||pendingSeek||0);}
  
  function timingLabel(index=state.index){
    const m=D.movements[index],s=sources[index],c=state.calibrations[s.key];
    if(c?.anchors?.length)return t('已设人工定位','Manual Calibrated');
    if(c?.offset)return t('整体偏移定位','Global Offset Active');
    if(index===state.index&&stages[state.active]?.timing==='reference'&&m.timing==='inherited')return t('总谱比对参考 · ≈','Score-Aligned Ref · ≈');
    return !s.custom?t('布列兹 / 维也纳爱乐录音基准','Pierre Boulez · VPO Reference'):t('自选音轨定位','Custom Audio Timing');
  }

  function drawNav(){
    $('movementNav').innerHTML=D.movements.map((m,i)=>`<button class="movement-button ${i===state.index?'current':''}" data-movement="${i}" aria-current="${i===state.index?'page':'false'}"><b>${m.roman}</b><span>${esc(state.lang==='en'?(m.shortEn||tr(m,'title')):tr(m,'title'))}</span><small>${fmt(sources[i].duration)}</small></button>`).join('');
  }
  function setView(){state.view='map';}
  
  function rememberFocus(){
    const active=document.activeElement,id=active?.id;
    const identity=Object.entries(active?.dataset||{}).find(([key,value])=>['movement','filter','bookmark','calibrate','synthMode','trackMute','action','synthReal','motif','motifLoop','score','contextCard','contextSynth'].includes(key)&&/^[\w-]+$/.test(value));
    return ()=>{if(!active||active.isConnected)return;const [key,value]=identity||[];const name=key?.replace(/[A-Z]/g,c=>'-'+c.toLowerCase());const target=id?$(id):name?document.querySelector(`[data-${name}="${value}"]`):null;target?.focus({preventScroll:true});};
  }

  function updateStaticLabels(){
    document.documentElement.lang=state.lang==='en'?'en':'zh-CN';
    document.title=t('Bruckner 8 · 声音大教堂与复调导览 (Robert Haas / Pierre Boulez · VPO)','Bruckner 8 · Sonic Cathedral & Contrapuntal Guide (Robert Haas / Pierre Boulez · VPO)');
    const skipLink=$('skipLink');if(skipLink)skipLink.textContent=t('跳到导览','Skip to guide');
    const langBtn=$('langBtn');if(langBtn)langBtn.textContent=state.lang==='en'?'中文':'English';
    const btnSettings=$('btnSettings');if(btnSettings)btnSettings.textContent=t('音源与校准','Audio & Timing');
    const btnSources=$('btnSources');if(btnSources)btnSources.textContent=t('资料','Sources');
    const prevMvt=$('prevMovement');if(prevMvt){prevMvt.textContent=t('◀ 上一章','◀ Prev Mvt');prevMvt.setAttribute('aria-label',t('上一乐章','Previous Movement'));}
    const nextMvt=$('nextMovement');if(nextMvt){nextMvt.textContent=t('下一章 ▶','Next Mvt ▶');nextMvt.setAttribute('aria-label',t('下一乐章','Next Movement'));}
    const loopBtn=$('loop');if(loopBtn)loopBtn.textContent=t('🔁 段落循环','🔁 Loop Stage');
    const followBtn=$('follow');if(followBtn)followBtn.textContent=t('📍 自动跟随','📍 Auto Follow');
    const continuousBtn=$('continuous');if(continuousBtn)continuousBtn.textContent=t('⇥ 连续乐章','⇥ Auto Next');
    const speedSelect=$('speed');if(speedSelect)speedSelect.setAttribute('aria-label',t('播放速度','Playback Speed'));
    const startFromBeginning=$('startFromBeginning');if(startFromBeginning)startFromBeginning.textContent=t('▶ 从头听这章','▶ Play from Start');
    const btnOverview=$('btnOverview');if(btnOverview)btnOverview.textContent=t('全曲线索','Symphonic Threads');
    const btnGlossary=$('btnGlossary');if(btnGlossary)btnGlossary.textContent=t('小词典','Glossary');
    const footerTitle=$('footerTitle');if(footerTitle)footerTitle.textContent=t('Bruckner 8 · Pierre Boulez / Wiener Philharmoniker (DG 1996)','Bruckner 8 · Pierre Boulez / Wiener Philharmoniker (DG 1996)');
    const btnFooterSources=$('btnFooterSources');if(btnFooterSources)btnFooterSources.textContent=t('音源与定位说明','Audio Sources & Timing Notes');
    const footerShortcuts=$('footerShortcuts');if(footerShortcuts)footerShortcuts.textContent=t('Space 播放 · ← → 5 秒 · Esc 停止积木试听','Space: Play/Pause · ← →: ±5s · Esc: Stop MIDI');
    const heroGerman=$('heroGerman');if(heroGerman)heroGerman.textContent=movement().originalTitle;
    const heroSubtitle=$('heroSubtitle');if(heroSubtitle)heroSubtitle.textContent=t(' · 罗伯特·哈斯版 · 声音大教堂 · 复调雷达 · 四重对位',' · Robert Haas Edition · Sonic Cathedral · Polyphony Radar · Quadruple Counterpoint');
    const introH2=document.querySelector('.chapter-intro h2');if(introH2)introH2.textContent=t('🎼 这一章怎么听？','🎼 How to Listen to This Movement');
  }

  function renderMovement(){
    const restoreFocus=rememberFocus(),m=movement();
    drawNav();updateStaticLabels();
    $('consoleMovement').textContent=`Bruckner 8 · ${m.roman}. ${m.shortEn||tr(m,'title')}`;
    $('heroTitle').textContent=`${m.roman}. ${state.lang==='en'?(m.shortEn||tr(m,'title')):tr(m,'title')}`;
    $('heroGerman').textContent=m.originalTitle;
    $('heroLength').textContent=`${source().custom?t('自选音轨','Custom Audio'):'Pierre Boulez · Wiener Philharmoniker (DG 1996)'} (${fmt(source().duration)})`;
    $('chapterIntro').textContent=tr(m,'introduction')||tr(m,'form');
    $('firstMission').textContent=tr(m,'mission');
    $('mapCount').textContent=state.lang==='en'?`${m.stages.length}-Stage Score Timeline`:`${m.stages.length}`;
    const tlH2=document.querySelector('.timeline-heading h2');
    if(tlH2){
      const ht=`${m.roman}. ${state.lang==='en'?(m.shortEn||tr(m,'title')):tr(m,'title')}`;
      tlH2.innerHTML=state.lang==='en'
        ?`🗺️ <span id="heroTitle">${esc(ht)}</span> · <span id="mapCount">${m.stages.length}</span>-Stage Score Timeline`
        :`🗺️ <span id="heroTitle">${esc(ht)}</span> · <span id="mapCount">${m.stages.length}</span> 节点全景时间轴`;
    }
    $('prevMovement').disabled=state.index===0;
    $('nextMovement').disabled=state.index===D.movements.length-1;
    $('duration').textContent=fmt(source().duration);
    $('scrub').max=String(source().duration);
    $('wavePosition').textContent=`00:00 — ${fmt(source().duration)}`;
    $('timingNote').textContent=`${timingLabel()} · ${t('点击卡片或秒数直接听，支持段落循环','Click card or timestamp to listen · Supports loop')}`;
    renderFilters();renderTimeline();renderMotifs();renderNext();renderTelemetry();renderToggles();updateClock();restoreFocus();
  }

  function renderFilters(){
    const restoreFocus=rememberFocus(),m=movement();
    const items=[['all',`${t('全部','All')} ${m.stages.length}`],...m.motifs.map(x=>[x.id,tr(x,'name')]),['saved',t('☆ 收藏','☆ Saved')]];
    $('filters').innerHTML=items.map(([id,label])=>`<button class="filter ${state.filter===id?'selected':''}" data-filter="${esc(id)}" aria-pressed="${state.filter===id}">${esc(label)}</button>`).join('');
    restoreFocus();
  }

  function renderContextNotes(s,index){
    return (s.insights||[]).map((note,ni)=>`<aside id="context-${esc(note.id)}" class="context-note" tabindex="-1" aria-label="${esc(tr(note,'title'))}"><h5>${esc(tr(note,'title'))}</h5><p>${esc(tr(note,'body'))}</p>${note.listen?`<p><b>${t('怎么听：','How to listen: ')}</b>${esc(tr(note,'listen'))}</p>`:''}<div class="context-actions">${(note.links||[]).map((link,li)=>`<button data-context-jump="${index},${ni},${li}">🎧 ${esc(tr(link,'label'))}</button>`).join('')}${Number.isInteger(note.synthMode)?`<button data-context-synth="${note.synthMode}">⌨ ${t('查看这段 MIDI','View MIDI Track')}</button>`:''}</div><details><summary>${t('出处与解读','Sources & Context')}</summary>${note.caveat?`<p>${esc(tr(note,'caveat'))}</p>`:''}${(note.sources||[]).map(ref=>`<div class="context-source"><a href="${esc(ref.url)}" target="_blank" rel="noopener noreferrer">${esc(ref.title)} ↗</a>${ref.note?`<br>${esc(ref.note)}`:''}</div>`).join('')}</details></aside>`).join('');
  }

  function choirGroups(){
    return [
      ['strings','🎻',t('弦乐群','Strings')],
      ['winds','🪈',t('木管声部','Woodwinds')],
      ['horns','📯',t('圆号与瓦格纳大号','Horns & Wagner Tubas')],
      ['brass','🎺',t('重铜管','Heavy Brass')],
      ['perc','🥁',t('竖琴与打击','Harps & Perc')]
    ];
  }

  function renderTimeline(){
    const restoreFocus=rememberFocus(),m=movement(),seenActs=new Set();
    const insights=m.stages.flatMap(s=>(s.insights||[]).map(note=>({stageId:s.id,note})));
    $('contextLinks').innerHTML=insights.length?`<span>${t('循着这些线索听','Key threads to follow')}</span>`+insights.map(({stageId,note})=>`<button data-context-card="${esc(note.id)}">${esc(tr(note,'shortTitle')||tr(note,'title'))}</button>`).join(''):'';
    const choirNames=Object.fromEntries(choirGroups(m).map(([id,emoji,name])=>[id,`${emoji} ${name}`]));
    
    const cards=stages.map((s,i)=>{
      const book=state.bookmarks.includes(keyFor(state.index,s.id));
      if(state.filter==='saved'&&!book)return '';
      if(!['all','saved'].includes(state.filter)&&!s.blocks?.includes(state.filter))return '';
      const end=stages[i+1]?.start??source().duration,approx=source().custom;
      const anchor=calibration().anchors?.some(a=>a.base===m.stages[i].start);
      let heading='';
      if(s.act&&!seenActs.has(s.act)){
        seenActs.add(s.act);
        const first=stages.findIndex(x=>x.act===s.act),next=stages.findIndex((x,j)=>j>first&&x.act!==s.act);
        const title=(tr(s,'actName')||(t('第 ','Act ')+s.act+t(' 幕',''))).replace(/\s*[（(]\d{2}:\d{2}.*[）)]\s*$/,'');
        heading=`<div class="act-heading"><h3>${esc(title)}</h3><span>${approx?'≈ ':''}${fmt(stages[first].start)} – ${fmt(next<0?source().duration:stages[next].start)}</span></div>`;
      }
      const detail=s.choirs?`<div class="stage-choirs">${Object.entries(s.choirs).filter(([key,v])=>v.active||v.highlight).map(([key,v])=>`<span><b>${choirNames[key]||key}:</b> ${esc(tr(v,'role'))}</span>`).join('')}</div>`:`<div class="stage-layers"><span>🎯 ${esc(tr(s,'foreground'))}</span><span>↳ ${esc(tr(s,'background'))}</span></div>`;
      return `${heading}<article id="stage-${i}" class="stage ${state.active===i?'current':''}" style="--stage-color:${esc(s.color||'#d97706')}"><div class="stage-body"><button class="stage-select" data-stage="${i}" aria-label="From ${fmt(s.start)} play ${esc(tr(s,'title'))}"><div class="stage-topline"><span class="stage-time">${approx&&!anchor?'≈ ':''}${fmt(s.start)} – ${fmt(end)}</span><span class="stage-number">#${String(i+1).padStart(2,'0')}</span><span class="stage-play">${t('▶ 点击听这段','▶ Play Stage')}</span></div><h4>${esc(tr(s,'title'))}</h4><div class="stage-pills">${(s.blocks||[]).map(block=>{const motif=m.motifs.find(x=>x.id===block);return motif?`<span class="stage-pill">${esc(tr(motif,'name'))}</span>`:'';}).join('')}<span class="stage-pill">${esc(tr(s,'focus'))}</span></div>${detail}<p>${esc(tr(s,'desc'))}</p></button>${renderContextNotes(s,i)}<div class="stage-tools">${(s.cues||[]).map(c=>`<button class="cue" data-cue="${c.sec}" title="${esc(tr(c,'label'))}">${approx?'≈ ':''}${fmt(mappedTime(c.sec))} ${esc(tr(c,'label').replace(/^\d{2}:\d{2}\s*/,''))}</button>`).join('')}${s.score?`<button class="score-ref" data-score="${i}" title="${t('查看总谱位置与配器依据','View full score location & orchestration evidence')}">📖 ${esc(s.score.label)}</button>`:''}<button class="bookmark ${book?'saved':''}" data-bookmark="${i}" aria-pressed="${book}">${book?t('★ 已收藏','★ Saved'):t('☆ 收藏','☆ Save')}</button><button data-calibrate="${i}">${anchor?t('✓ 已定位','✓ Calibrated'):t('定位校准','Calibrate')}</button></div><div class="stage-progress" aria-hidden="true"><span></span></div></div></article>`;
    }).join('');
    
    $('timeline').innerHTML=cards||`<p class="empty-filter">${t('还没有收藏。点卡片下方的「☆ 收藏」。','No saved stages yet. Click \"☆ Save\" beneath any card.')}</p>`;
    updateStageProgress();restoreFocus();
  }

  function currentAudioTime(){
    if(pendingSeek!==null&&(audio.seeking||audio.readyState<1))return pendingSeek;
    return audio.currentTime||0;
  }

  function updateStageProgress(){
    const time=currentAudioTime();
    stages.forEach((s,i)=>{const end=stages[i+1]?.start??source().duration;const progress=end>s.start?E.clamp((time-s.start)/(end-s.start),0,1):0;$(`stage-${i}`)?.style.setProperty('--stage-progress',`${progress*100}%`);});
  }

  function renderNext(){
    const m=movement(),next=D.movements[state.index+1];
    const quadIdx=Math.max(0,D.movements[3].stages.findIndex(s=>s.id===D.movements[3].codaStageId||(s.blocks||[]).includes('m4-quadruple-coda')));
    $('nextCard').innerHTML=next?`<p>${esc(tr(m,'next')||tr(m,'mission')||tr(m,'subtitle'))}</p><button class="primary-small" data-next-card="true">${t('下一乐章 ','Next Movement ')}${next.roman}. ${esc(state.lang==='en'?(next.shortEn||tr(next,'title')):tr(next,'title'))} →</button>`:`<p>${t('全曲结束。回到第四乐章尾声，再次见证人类西方复调音乐最高神迹！','Symphony complete. Return to Movement 4 Coda to marvel at the Quadruple Counterpoint miracle!')}</p><button class="primary-small" data-cross="3,${quadIdx}">↩ ${t('重听终曲四重对位神迹','Relisten to Quadruple Counterpoint')}</button>`;
  }

  function currentRoleCue(){const s=stages[state.active];const curT=currentAudioTime();return (s?.cues||[]).filter(c=>c.choirs&&mappedTime(c.sec)<=curT+.025).at(-1);}
  function roleKey(){return `${state.index}:${state.active}:${currentRoleCue()?.sec??''}`;}

  function renderTelemetry(){
    const s=stages[state.active];if(!s)return;const m=movement(),cue=currentRoleCue();
    telemetryKey=roleKey();
    const actPart=(tr(s,'actName')||'').split(' · ')[0]||(t('第 ','Act ')+s.act+t(' 幕',''));
    $('liveActBadge').textContent=actPart;
    $('liveStage').textContent=tr(cue,'label')||tr(s,'title');
    $('liveFocus').textContent=tr(s,'desc');
    $('syncBadge').textContent=timingLabel();
    $('liveTimeRange').textContent=`${fmt(s.start)} – ${fmt(stages[state.active+1]?.start??source().duration)}`;
    $('liveBlockBadges').innerHTML=m.motifs.map(x=>`<span class="block-badge ${(s.blocks||[]).includes(x.id)?'active':''}" style="--motif-color:${esc(x.color)}">${esc(tr(x,'name'))}</span>`).join('')+`<span class="radar-note" title="${t('按总谱事件提示聆听层次；未标为重点不表示该乐器休止。','Voice tracking based on score events; unhighlighted instruments are not necessarily resting.')}">${t('本段声部导听','Voice Tracking')}${s.score?' · '+esc(s.score.label):''}</span>`;
    const roles=cue?.choirs||s.choirs||{};
    $('choirRadarGrid').innerHTML=choirGroups(m).map(([id,emoji,name])=>{
      const info=roles[id],active=!!info?.active,highlight=!!info?.highlight,role=tr(info,'role')||t('此处未指定聆听任务','No specific task for this section');
      return `<div class="choir-card ${active?'active':''} ${highlight?'highlight':''}" title="${esc(role)}"><div><b>${emoji} ${esc(name)}</b><span>${highlight?t('★ 先听','★ Lead'):active?t('伴随 / 应答','Accompanying'):t('声部提示','Voice Hint')}</span></div><p>${esc(role)}</p></div>`;
    }).join('');
    document.querySelectorAll('.stage').forEach(el=>el.classList.toggle('current',el.id===`stage-${state.active}`));
  }

  function showScore(index){
    const s=movement().stages[index];if(!s?.score)return;
    openDialog(`${movement().roman}. ${tr(s,'title')}`,`<p><b>${esc(s.score.label)}</b>${s.score.page?' · '+t('总谱页 ','Score Page ')+esc(s.score.page):''}</p><p>${esc(tr(s.score,'observation')||tr(s,'desc'))}</p><h3>${t('本段各乐器声部配置','Voice Roles in This Section')}</h3>${choirGroups().filter(([key])=>s.choirs?.[key]).map(([key,emoji,name])=>`<p><b>${emoji} ${esc(name)}</b>：${esc(tr(s.choirs[key],'role'))}</p>`).join('')}<p>${esc(s.score.edition||'Robert Haas Edition (1890)')} · ${t('小节号精准定位音乐建筑结构；在布列兹与维也纳爱乐棒下复调内声部纤毫毕现。','Bar numbers mark structural milestones; Boulez and the Vienna Philharmonic illuminate inner voice leading with X-ray clarity.')}</p><h3>${t('录音位置','Recording Position')}</h3><p>≈ ${fmt(mappedTime(s.start))} · ${t('由哈斯版总谱 MIDI 与布列兹 / 维也纳爱乐乐团 1996 圣弗洛里安修道院录音（DG）进行音高特征色度图（Chroma DTW）对齐校核。','Aligned via Chroma DTW between the Robert Haas score MIDI and Pierre Boulez\'s 1996 DG recording with the Wiener Philharmoniker.')}</p>`);
  }

  function renderMotifs(){
    const m=movement();
    $('quickJumps').innerHTML=m.motifs.map((motif,i)=>{
      const tm=motif.audioStart!==undefined?mappedTime(motif.audioStart):stages[motif.stageIndex]?.start||0;
      return `<button data-motif="${i}" style="--motif-color:${esc(motif.color)}">${fmt(tm)} ${esc(tr(motif,'name'))}</button>`;
    }).join('');
    $('motifCards').innerHTML=m.motifs.map((motif,i)=>`<div class="motif-mini" style="--motif-color:${esc(motif.color)}"><b>${esc(tr(motif,'name'))}</b><span>${esc(tr(motif,'earprint'))}</span><button data-motif="${i}">🎧 ${t('原声','Audio')}</button><button data-motif-loop="${i}">↻ ${t('15 秒','15s Loop')}</button></div>`).join('');
    renderSynth();
  }

  function renderThreads(){}

  function renderToggles(){
    if(synthGraph[0])synthGraph[0].gain.value=audio.muted?0:.28*audio.volume;
    [['follow',state.follow],['continuous',state.continuous],['loop',!!state.loop&&!state.loop.once]].forEach(([id,on])=>{
      $(id).classList.toggle('active',on);$(id).setAttribute('aria-pressed',String(on));
    });
    $('speed').value=String(state.speed);
    $('mute').textContent=audio.muted?'♩':'♪';
    $('mute').setAttribute('aria-label',audio.muted?t('取消静音','Unmute'):t('静音','Mute'));
    $('mute').title=audio.muted?t('已静音','Muted'):t('静音','Mute');
    document.documentElement.dataset.theme=state.theme;
    $('themeBtn').textContent=state.theme==='dark'?'☼':'◐';
    $('themeBtn').setAttribute('aria-label',state.theme==='dark'?t('切换浅色总谱主题','Switch to Light Theme'):t('切换深色音乐厅主题','Switch to Dark Theme'));
    const langBtn=$('langBtn');if(langBtn)langBtn.textContent=state.lang==='en'?'中文':'English';
  }

  async function loadWave(index){
    const m=D.movements[index];if(waves.has(sources[index].key))return;
    if(Array.isArray(m.waveform)&&m.waveform.length){waves.set(sources[index].key,m.waveform);if(index===state.index)drawWave();return;}
    try{
      const response=await fetch(asset(m.rms||`assets/movement-${m.id}-rms.json`));if(!response.ok)throw Error();
      const data=await response.json();
      if(!sources[index].custom)waves.set(sources[index].key,Array.isArray(data)?data:(data.values||data.rms));
      if(index===state.index)drawWave();
    }catch{
      if(index===state.index)$('waveSource').textContent=t('振幅数据未载入 · 仍可拖动定位','Waveform data not loaded · Seek still active');
    }
  }

  function drawWave(){
    const canvas=$('wave'),box=canvas.getBoundingClientRect();if(!box.width)return;
    const dpr=window.devicePixelRatio||1;canvas.width=Math.floor(box.width*dpr);canvas.height=Math.floor(box.height*dpr);
    const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
    const w=box.width,h=box.height,rms=waves.get(source().key),curT=currentAudioTime(),duration=source().duration;
    const css=getComputedStyle(document.documentElement),muted=css.getPropertyValue('--faint').trim(),gold=css.getPropertyValue('--gold').trim();
    ctx.clearRect(0,0,w,h);
    if(rms?.length){
      const max=Math.max(.001,...rms);const count=Math.max(1,Math.floor(w/3));
      for(let i=0;i<count;i++){
        const from=Math.floor(i/count*rms.length),to=Math.max(from+1,Math.floor((i+1)/count*rms.length));
        let level=0;for(let j=from;j<to;j++)level=Math.max(level,rms[j]);
        const bar=Math.max(2,Math.pow(level/max,.65)*(h-7));
        const second=i/count*duration;
        const stage=stages[E.stageAt(stages,second)];
        ctx.globalAlpha=second<=curT?.92:.35;
        ctx.fillStyle=stage?.color||muted;
        ctx.fillRect(i/count*w,(h-bar)/2,Math.max(1,w/count-1.3),bar);
      }
    }else{
      ctx.globalAlpha=.3;ctx.fillStyle=muted;ctx.fillRect(0,h/2,w,1);
      ctx.globalAlpha=.7;ctx.fillStyle=gold;ctx.fillRect(0,h/2-1,w*(curT/duration),2);
    }
    ctx.globalAlpha=.8;stages.forEach(s=>{const x=s.start/duration*w;ctx.fillStyle=s.color||gold;ctx.fillRect(x,h-4,1,4);});
    const x=E.clamp(curT/duration,0,1)*w;ctx.globalAlpha=1;ctx.fillStyle=gold;ctx.fillRect(Math.max(0,x-1),0,1.5,h);
    ctx.beginPath();ctx.moveTo(x-3,0);ctx.lineTo(x+3,0);ctx.lineTo(x,5);ctx.fill();
    $('waveSource').textContent=t('布列兹 / 维也纳爱乐录音振幅 · 点击或拖动定位','Boulez · VPO Recording RMS · Click or drag to seek');
  }

  function updateClock(){
    const curT=currentAudioTime();
    $('currentTime').textContent=fmt(curT);
    $('scrub').value=String(curT);
    $('scrub').setAttribute('aria-valuetext',`${fmt(curT)}, / ${fmt(source().duration)}`);
    $('play').innerHTML=`<span>${wantsPlayback()?t('Ⅱ 暂停原声','Ⅱ Pause'):t('▶ 播放原声','▶ Play')}</span>`;
    $('play').setAttribute('aria-label',wantsPlayback()?t('暂停','Pause'):t('播放','Play'));
    updateStageProgress();drawWave();
  }

  function pausePlayback(){playbackIntent++;pendingAutoplay=false;audio.pause();updateClock();}
  async function play(){
    playbackIntent++;pendingAutoplay=false;stopSynth();
    state.manualUntil=0;
    followCurrent({force:true});
    try{await audio.play();}catch(err){if(err.name==='AbortError')return;toast(t('播放没有开始，请再点击播放；若音轨载入失败，可在「音源与校准」重试。','Playback did not start. Click Play again or check Audio Settings.'));}
    updateClock();
  }
  function togglePlay(){if(wantsPlayback())pausePlayback();else play();}

  function applyAudioTime(target){
    if(!Number.isFinite(target))return;
    try{
      if(audio.readyState>=1){
        audio.currentTime=target;
      }
    }catch{}
  }

  function seek(time,autoplay=false,{preserveSynth=false,referenceTime=null,scroll=true}={}){
    if(!preserveSynth)stopSynth();
    const target=E.clamp(time,0,Math.max(0,source().duration-.05));
    pendingSeek=target;pendingReference=referenceTime;
    const prevActive=state.active;
    state.active=E.stageAt(stages,target);
    renderTelemetry();
    $('currentTime').textContent=fmt(target);
    $('scrub').value=String(target);
    updateStageProgress();drawWave();

    if(audio.readyState>=1){
      applyAudioTime(target);
    }else{
      const onReady=()=>{
        applyAudioTime(pendingSeek!==null?pendingSeek:target);
      };
      audio.addEventListener('loadedmetadata',onReady,{once:true});
      audio.addEventListener('canplay',onReady,{once:true});
    }

    if(autoplay){
      state.manualUntil=0;
      const p=play();
      if(p&&p.then){
        p.then(()=>{
          if(Number.isFinite(target)&&target>0.5&&Math.abs(audio.currentTime-target)>1.5){
            applyAudioTime(target);
          }
        });
      }
    }
    if(scroll&&(autoplay||state.active!==prevActive)){
      if(autoplay)state.manualUntil=0;
      followCurrent({force:autoplay||wantsPlayback()});
    }
  }

  function setLoop(range){
    if(!Number.isFinite(range.start)||!Number.isFinite(range.end)||range.end-range.start<=.05){
      state.loop=null;toast(t('这段定位没有可循环的时长，请先调整校准。','No loopable range for this stage. Adjust timing calibration.'));return false;
    }
    state.loop=range;return true;
  }

  function playStage(index,loop=false){
    const s=stages[index];if(!s)return;
    if(state.loop&&!state.loop.once){const b=E.stageBounds(stages,index,source().duration);setLoop({...b,index});}
    if(loop){setLoop({start:s.start,end:Math.min(source().duration,s.start+15),index,referenceStart:movement().stages[index].start});}
    else if(state.loop?.once)state.loop=null;
    state.manualUntil=0;
    state.active=index;seek(s.start,true,{referenceTime:movement().stages[index].start,scroll:true});renderToggles();
  }

  function loadMovement(index,{time=0,referenceTime=null,autoplay=false,scroll=true}={}){
    if(index<0||index>=D.movements.length)return;
    stopSynth();synthMode=0;state.positions[source().key]=audio.currentTime||0;audio.pause();
    state.index=index;state.active=0;state.filter='all';state.loop=null;pendingSeek=time;pendingReference=referenceTime;pendingAutoplay=autoplay;
    const serial=++loadSerial,intent=++playbackIntent;
    audio.src=source().url;audio.playbackRate=state.speed;rebuildStages();renderMovement();store();
    if(scroll&&time<=0)window.scrollTo({top:0,behavior:reduced?'instant':'smooth'});
    updateHash(index,time);
    audio.addEventListener('loadedmetadata',function ready(){
      if(serial!==loadSerial)return;
      const measured=audio.duration;
      if(Number.isFinite(measured)&&measured>0){
        source().duration=measured;rebuildStages();
        if(pendingReference!==null)pendingSeek=mappedTime(pendingReference);
        if(state.loop){
          const loop=state.loop;
          if(loop.referenceStart!==undefined){const start=mappedTime(loop.referenceStart);setLoop({...loop,start,end:Math.min(measured,start+15)});}
          else setLoop({...E.stageBounds(stages,loop.index,measured),index:loop.index});
        }
        renderMovement();
      }
      seek(pendingSeek,false,{preserveSynth:true,scroll:scroll&&pendingSeek>0});
      if(pendingAutoplay&&intent===playbackIntent)play();
    },{once:true});
    audio.load();loadWave(index);
  }

  function updateHash(index,time){hashBusy=true;history.replaceState(null,'',`#movement=${index+1}${time>0?`&time=${Math.floor(time)}`:''}`);queueMicrotask(()=>hashBusy=false);}
  function followCurrent({force=false}={}){
    if(!state.follow||state.view!=='map')return;
    if(!force&&(performance.now()<state.manualUntil||!wantsPlayback()))return;
    let el=$(`stage-${state.active}`);
    if(!el&&force&&state.filter!=='all'){
      state.filter='all';renderFilters();renderTimeline();
      el=$(`stage-${state.active}`);
    }
    if(!el)return;
    const consoleBottom=$('console').getBoundingClientRect().bottom+16;
    const rect=el.getBoundingClientRect();
    if(force||rect.top<consoleBottom||rect.bottom>innerHeight-24){
      const avail=Math.max(0,innerHeight-consoleBottom);
      const pad=avail>rect.height+32?Math.min(48,(avail-rect.height)*0.22):0;
      const targetY=Math.max(0,window.scrollY+rect.top-consoleBottom-pad);
      window.scrollTo({top:targetY,behavior:reduced?'instant':'smooth'});
    }
  }

  function audioTick(){
    if(audio.seeking)return;
    const curT=audio.currentTime||0;
    if(pendingSeek!==null){
      if(Math.abs(curT-pendingSeek)>2.0&&curT<1.5)return;
      pendingSeek=null;
    }
    if(state.loop&&curT>=state.loop.end-.045){
      if(state.loop.once){audio.pause();state.loop=null;renderToggles();}
      else{seek(state.loop.start,false,{scroll:false});return;}
    }
    const index=E.stageAt(stages,curT);
    if(index!==state.active){state.active=index;renderTelemetry();followCurrent();}
    else if(telemetryKey!==roleKey())renderTelemetry();
    state.positions[source().key]=curT;updateClock();
  }

  function ended(){
    if(state.loop&&!state.loop.once){seek(state.loop.start,true);return;}
    state.loop=null;const next=E.nextMovement(state.index,D.movements.length,state.continuous);
    if(next!==null){loadMovement(next,{autoplay:true});toast(`${t('进入第 ','Entering Movement ')}${next+1}${t(' 乐章 · ',' · ')}${state.lang==='en'?(D.movements[next].shortEn||tr(D.movements[next],'title')):tr(D.movements[next],'title')}`);}
    else{updateClock();renderToggles();toast(state.index===3?t('全曲结束。西方复调艺术的终极殿堂已然落成！','Symphony complete. The ultimate summit of western counterpoint is crowned!'):t('乐章结束。可用顶部按钮进入下一乐章。','Movement finished. Use top bar to enter next movement.'));}
    store();
  }

  function showCalibration(index){
    const s=stages[index],m=movement();
    openDialog(t('给耳朵找到的位置，留一个坐标。','Set a coordinate for what your ears hear.'),`<p><b>${esc(m.roman)}. ${esc(tr(s,'title'))}</b></p><p>${t('先在原声中找到这段真正开始的位置，暂停，再把播放器此刻的时间设为段落开头。保存后，相邻参考位置按已有定位点插值；未定位的段落仍是参考值。','Locate where this section actually begins in the recording, pause, and set the current player time as the stage start. Adjacent stages interpolate from calibrated anchors.')}</p><div class="calibrate-row"><label for="anchorTime">${t('段落开始时间（秒）','Stage Start (seconds)')}</label><input id="anchorTime" type="number" min="0" max="${source().duration}" step="0.1" value="${(audio.currentTime||0).toFixed(1)}"><span class="quiet">${t('当前 ','Current ')}${fmt(audio.currentTime)}</span></div><div class="dialog-actions"><button class="primary-small" data-save-anchor="${index}">${t('把此刻设为段落开头','Set Current Time as Start')}</button><button class="secondary-small" data-delete-anchor="${index}">${t('撤销这个定位点','Reset This Anchor')}</button></div><p>${t('只为当前音源保存，不会套用到其他版本的录音。段落循环与所有跳转随校准更新。','Saved locally for this recording only. Stage looping and jumps update automatically.')}</p>`);
  }

  function saveAnchor(index){
    const time=Number($('anchorTime').value),m=movement(),c=E.rebaseCalibration(calibration(),source().duration);
    const error=E.validateAnchor(m.stages,index,time,source().duration,c);
    if(error){toast(error);return;}
    c.anchors=c.anchors.filter(a=>a.base!==m.stages[index].start);
    c.anchors.push({base:m.stages[index].start,time});
    state.calibrations[source().key]=c;state.loop=null;rebuildStages();renderMovement();store();closeDialog();
    toast(`${t('已保存定位：','Saved anchor: ')}${fmt(time)}`);
  }

  function deleteAnchor(index){
    const c={...calibration(),anchors:(calibration().anchors||[]).filter(a=>a.base!==movement().stages[index].start)};
    state.calibrations[source().key]=c;state.loop=null;rebuildStages();renderMovement();store();closeDialog();
    toast(t('已撤销这个定位点。','Reset anchor point.'));
  }

  function showSettings(){
    openDialog(t('四大乐章，都在这里。','All Four Movements, in One Place.'),`<p>${t('内置四大乐章皮埃尔·布列兹 / 维也纳爱乐乐团（1996 圣弗洛里安修道院 · DG）原声录音，直接播放。页面打开时保持暂停。你也可以换成自己的本地音轨（支持 FLAC/WAV/MP3/M4A）；自选文件仅在本次浏览器会话使用。','Built-in complete Pierre Boulez / Wiener Philharmoniker (1996 St. Florian Abbey · DG) recordings, ready to play. You may also drop in your own local audio files; local files remain in this browser session only.')}</p>${D.movements.map((m,i)=>`<div class="source-row"><b>${m.roman}. ${esc(state.lang==='en'?(m.shortEn||tr(m,'title')):tr(m,'title'))}</b><small>${esc(sources[i].name)} · ${fmt(sources[i].duration)}${i===state.index?` · ${t('当前','Current')}`:''}</small><label class="file-label">${t('替换音轨','Replace Audio')}<input type="file" accept="audio/*,.mp3,.m4a,.flac,.wav,.ogg" data-import="${i}"></label>${sources[i].custom?`<button class="text-button" data-restore="${i}">${t('恢复内置','Restore Default')}</button>`:''}</div>`).join('')}<div class="calibrate-row"><label><input type="checkbox" data-continuous-option="true" ${state.continuous?'checked':''}> ${t('连续播放下一乐章','Play next movement continuously')}</label></div><h3>${t('当前乐章的定位','Current Movement Timing')}</h3><p>${esc(timingLabel())}。${t('逐段校准可在每张段落卡片下方进行；这里可以统一微调整章。','Per-stage calibration can be adjusted on each card; adjust global offset here.')}</p><div class="calibrate-row"><label for="chapterOffset">${t('所有节点偏移（秒）','Global Stage Offset (seconds)')}</label><input id="chapterOffset" type="number" step="0.5" value="${Number(calibration().offset)||0}"><button class="primary-small" data-action="save-offset">${t('应用偏移','Apply Offset')}</button></div><div class="dialog-actions"><button class="secondary-small" data-action="reset-calibration">${t('恢复本章默认定位','Reset to Default')}</button><button class="secondary-small" data-action="export-calibration">${t('导出定位 JSON','Export Calibration JSON')}</button></div><p>${t('正数使导览晚一点切换，负数使导览早一点切换。校准只存在此浏览器。换录音会同时改变速度比例，请重新定位关键节点。','Positive numbers delay card switches, negative numbers advance them. Calibrations persist locally.')}</p><button class="text-button" data-action="sources">${t('查看录音来源与版本考据 ↗','View recording sources and edition notes ↗')}</button>`);
  }

  async function importTrack(index,file){
    if(!file)return;const old=sources[index];if(old.custom)URL.revokeObjectURL(old.url);
    sources[index]={url:URL.createObjectURL(file),key:`local:${file.name}:${file.size}:${file.lastModified}`,duration:D.movements[index].duration,name:file.name,custom:true};
    if(index===state.index){loadMovement(index,{scroll:false});closeDialog();toast(t('已切换到本地音轨，保持暂停。请按需要校准。','Loaded local audio track. Calibrate timing if needed.'));}
    else{showSettings();toast(`${t('已替换第 ','Replaced Movement ')}${index+1}${t(' 乐章，切换时载入。',' track; loaded upon switching.')}`);}
  }

  function showSources(){
    openDialog(t('音源、版本考据与学术资料','Audio Sources, Editions & Musicology'),`<h3>${t('版本公案：罗伯特·哈斯版 (Robert Haas, 1939)','The Historic Debate: Robert Haas Edition')}</h3><p>${t('布鲁克纳交响曲中最著名的版本争议莫过于第八交响曲。1887年初稿遭到指挥家列维拒绝后，布鲁克纳在沙尔克等弟子的过度干预下删削了第三乐章高潮与终曲展开部。罗伯特·哈斯版（1939）审慎剔除了非自愿的删减，使整部交响大教堂重获顶天立地的平衡感。皮埃尔·布列兹、卡拉扬、旺德与切利比达克皆采用哈斯版；本系统经逐小节比对确认，布列兹1996年录音与总谱MIDI 100%同属哈斯版（417/483/301/747小节）。','The historic debate centers on Robert Haas (1939) restoring cuts made under external pressure from Josef Schalk in the 1890 revision. Haas restores vital measures in the Adagio and Finale development, yielding the supreme architectural balance championed by Boulez, Karajan, Wand, and Celibidache. Both our score MIDI and Boulez\'s 1996 recording are verified bar-for-bar as the exact Robert Haas Edition (417/483/301/747 bars).')}</p><h3>${t('皮埃尔·布列兹（Pierre Boulez）的「X 光级」复调透光感','Pierre Boulez\'s X-Ray Contrapuntal Transparency')}</h3><p>${t('1996年，现代主义大师皮埃尔·布列兹执棒维也纳爱乐乐团，在布鲁克纳灵魂归宿地——圣弗洛里安修道院（St. Florian Abbey）由 DG 录制了这一传奇版本。得益于布列兹「X 光扫描仪」般的听觉平衡与 DG 精密的多点拾音，维也纳爱乐华美的铜管与丝绸弦乐被赋予了手术刀般犀利的清晰度：无论是第二乐章内声部的木管对位，还是第四乐章尾声「四大乐章主题四重对位」的同框叠置，每一条声部线条都纤毫毕现，绝无半点混响糊音。','In 1996, Pierre Boulez conducted the Wiener Philharmoniker at St. Florian Abbey for Deutsche Grammophon. Combining Boulez\'s X-ray ear for inner-voice balance with DG\'s precision engineering, this recording achieves unmatched polyphonic clarity—every inner woodwind line, viola counter-subject, and all four simultaneous themes in the Finale\'s Quadruple Counterpoint Coda emerge with surgical lucidity.')}</p><h3>${t('各乐章录音档案','Movement Recordings')}</h3>${D.movements.map((m,i)=>`<div class="source-link"><b>${m.roman}. ${esc(m.shortEn||tr(m,'title'))}</b> · <small>Pierre Boulez / Wiener Philharmoniker (DG 1996 · St. Florian) · ${fmt(sources[i].duration)}</small></div>`).join('')}`);
  }

  function showGlossary(){
    openDialog(t('布鲁克纳交响乐小词典','Brucknerian Listening Glossary'),D.glossary.map(x=>`<details><summary><b>${esc(tr(x,'term'))}</b></summary><p style="margin-top:6px; line-height:1.7;">${esc(tr(x,'definition'))}</p></details>`).join(''));
  }

  function showOverview(){
    openDialog(t('第八交响曲的四大宏观交响线索','Four Symphonic Threads of the Eighth'),D.threads.map(t=>`<h3>${esc(tr(t,'title'))}</h3><p style="margin-top:6px; line-height:1.8;">${esc(tr(t,'summary'))}</p>`).join(''));
  }

  function exportCalibration(){
    const data=JSON.stringify({work:'Bruckner Symphony No.8',source:source().name,movement:movement().id,duration:source().duration,calibration:calibration()},null,2);
    const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=`bruckner8-${movement().roman}-calibration.json`;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function getSynthModes(){return movement().synthModes||(movement().id===4?D.synthModes:[]);}

  function renderSynth(){
    const restoreFocus=rememberFocus(),modes=getSynthModes();
    synthMode=Math.min(synthMode,Math.max(0,modes.length-1));
    const mode=modes[synthMode];
    $('synthLab').innerHTML=`<div class="lab-head"><div><div class="lab-heading"><span class="lab-badge">${t('复调解剖实验室','Polyphony Anatomy Lab')}</span><h2>${t('核心动机 · 多轨钢琴卷帘与声部独立静音台','Multi-Track Piano Roll & Voice Muting Console')}</h2></div><p>${t('在钢琴卷帘中直观查看多声部对位交织，点击左侧声部按钮可分别静音/独奏；点击「在原声中听这段」可无缝跳入布列兹与维也纳爱乐录音！','Inspect polyphonic counterpoint in the piano roll; mute/unmute individual voices on the left; click \"Hear in Recording\" to jump directly into Boulez and the Vienna Philharmonic\'s performance!')}</p></div><div class="lab-controls"><a class="midi-download" href="${esc(asset(`assets/movement-${movement().id}.mid`))}" download="bruckner8-movement-${movement().id}.mid">${t('↓ 源 MIDI','↓ Source MIDI')}</a><button class="synth-button" data-action="synth-play" ${mode?'':'disabled'}>${synthPlaying?t('■ 停止积木试听','■ Stop Motif'):t('▶ 试听当前积木骨架','▶ Play Motif Skeleton')}</button><button class="primary-small" data-synth-real="true" ${mode?'':'disabled'}>🎧 ${t('在原声中听这段 ','Hear in Recording ')}${mode?fmt(mappedTime(mode.realJumpSec)):''}</button></div></div><div class="synth-tabs">${modes.map((x,i)=>`<button class="${i===synthMode?'selected':''}" data-synth-mode="${i}" aria-pressed="${i===synthMode}" style="--mode-color:${esc(x.tracks?.[0]?.color||'#f59e0b')}"><b>${i+1}. ${esc(tr(x,'name')||t('动机积木','Motif Block'))}</b><small>${esc(x.tracks.map(tk=>tr(tk,'name')||tk.name).join(' + '))}</small></button>`).join('')}</div>${mode?`<div class="piano-roll"><div id="pianoRows">${mode.tracks.map((track,ti)=>{const min=Math.min(...track.notes.map(n=>n.midi))-2,max=Math.max(...track.notes.map(n=>n.midi))+2,key=`${movement().id}-${synthMode}-${ti}`;return `<div class="piano-row ${synthMuted[key]?'muted':''}"><button class="track-mute" style="color:${esc(track.color)}" data-track-mute="${ti}" aria-pressed="${!!synthMuted[key]}">${synthMuted[key]?'🔇':'🔊'} ${esc(tr(track,'name')||track.name)}<small>${esc(tr(track,'sub')||track.sub||t('骨架音符','Voice Notes'))}</small></button><div class="piano-lane">${track.notes.map((n,ni)=>`<span class="piano-note" data-note="${ti}-${ni}" style="left:${n.start/mode.totalBeats*100}%;width:${n.dur/mode.totalBeats*100}%;bottom:${10+(n.midi-min)/Math.max(1,max-min)*65}%;--note-color:${esc(track.color)}" title="${esc(n.label||'MIDI '+n.midi)}">${esc(n.label||'')}</span>`).join('')}<i class="piano-playhead" style="left:0" hidden></i></div></div>`;}).join('')}</div></div><div class="synth-explanation"><p>${esc(tr(mode,'desc')||mode.desc||t('跟住一条线，再听另一条怎样加入。','Follow one voice line first, then listen to how the second voice enters.'))}</p><span>${Number(mode.bpm.toFixed(1))} BPM · ${Number((mode.totalBeats*60/mode.bpm).toFixed(1))} ${t('秒','sec')}<br>${esc(mode.provenance||t('罗伯特·哈斯版总谱动机','Robert Haas Score Motif'))}</span></div>`:`<p class="quiet">${t('本章动机积木正在载入；可先用下方按钮听原声。','Motif lab loading; listen to the recording below.')}</p>`}`;
    restoreFocus();
  }

  function stopSynth(){
    synthSerial++;synthPlaying=false;cancelAnimationFrame(synthFrame);
    for(const node of synthNodes){try{node.stop();}catch{}}synthNodes=[];
    for(const node of synthGraph){try{node.disconnect();}catch{}}synthGraph=[];
    synthTrackGains=[];
    document.querySelectorAll('.piano-playhead').forEach(el=>el.hidden=true);
    document.querySelectorAll('.piano-note.sounding').forEach(el=>el.classList.remove('sounding'));
    const btn=document.querySelector('[data-action="synth-play"]');
    if(btn)btn.textContent=t('▶ 试听当前积木骨架','▶ Play Motif Skeleton');
  }

  async function playSynth(){
    if(synthPlaying){stopSynth();return;}
    const serial=++synthSerial;pausePlayback();
    try{
      if(!synthCtx)synthCtx=new(window.AudioContext||window.webkitAudioContext)();
      await synthCtx.resume();
      if(serial!==synthSerial||!getSynthModes().length)return;
      const mode=getSynthModes()[synthMode],start=synthCtx.currentTime+.06,beat=60/mode.bpm;
      const master=synthCtx.createGain();master.gain.value=audio.muted?0:.28*audio.volume;
      const compressor=synthCtx.createDynamicsCompressor();master.connect(compressor);compressor.connect(synthCtx.destination);
      synthGraph=[master,compressor];synthPlaying=true;
      mode.tracks.forEach((track,ti)=>{
        const trackGain=synthCtx.createGain();trackGain.gain.value=synthMuted[`${movement().id}-${synthMode}-${ti}`]?0:1;
        trackGain.connect(master);synthTrackGains[ti]=trackGain;synthGraph.push(trackGain);
        track.notes.forEach(n=>{
          const osc=synthCtx.createOscillator(),gain=synthCtx.createGain(),filter=synthCtx.createBiquadFilter(),at=start+n.start*beat,dur=Math.max(.06,n.dur*beat);
          osc.type=track.wave||'sawtooth';osc.frequency.value=440*Math.pow(2,(n.midi-69)/12);filter.type='lowpass';filter.frequency.value=1800;
          gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.15,at+.02);gain.gain.setValueAtTime(.11,at+Math.max(.025,dur-.04));gain.gain.linearRampToValueAtTime(0,at+dur);
          osc.connect(filter);filter.connect(gain);gain.connect(trackGain);
          osc.start(at);osc.stop(at+dur+.03);
          osc.onended=()=>{osc.disconnect();filter.disconnect();gain.disconnect();};
          synthNodes.push(osc);
        });
      });
      renderSynth();
      const animate=()=>{
        if(!synthPlaying){master.disconnect();compressor.disconnect();return;}
        const now=(synthCtx.currentTime-start)/beat;
        document.querySelectorAll('.piano-playhead').forEach(el=>{el.hidden=false;el.style.left=`${E.clamp(now/mode.totalBeats,0,1)*100}%`;});
        if(now>=mode.totalBeats){stopSynth();master.disconnect();compressor.disconnect();return;}
        mode.tracks.forEach((track,ti)=>track.notes.forEach((n,ni)=>{
          const el=document.querySelector(`[data-note="${ti}-${ni}"]`);
          el?.classList.toggle('sounding',!synthMuted[`${movement().id}-${synthMode}-${ti}`]&&now>=n.start&&now<n.start+n.dur);
        }));
        synthFrame=requestAnimationFrame(animate);
      };
      synthFrame=requestAnimationFrame(animate);
    }catch{
      stopSynth();toast(t('此浏览器暂时无法启动合成试听；仍可播放原声。','Browser audio synthesis unavailable; recording playback active.'));
    }
  }

  document.addEventListener('click',event=>{
    const b=event.target.closest('button');if(!b)return;const d=b.dataset;
    if(b.id==='langBtn'){
      state.lang=state.lang==='en'?'zh':'en';
      store();
      updateStaticLabels();
      renderMovement();
      toast(state.lang==='en'?'Switched to English':'已切换为中文');
      return;
    }
    if(d.contextCard){
      const item=movement().stages.find(s=>s.insights?.some(n=>n.id===d.contextCard));if(!item)return;
      state.filter='all';state.manualUntil=performance.now()+10000;renderFilters();renderTimeline();
      const card=$(`context-${d.contextCard}`);card?.scrollIntoView({behavior:reduced?'instant':'smooth',block:'start'});card?.focus({preventScroll:true});return;
    }
    if(d.contextSynth!==undefined){
      const index=+d.contextSynth;if(!getSynthModes()[index])return;
      pausePlayback();stopSynth();synthMode=index;renderSynth();state.manualUntil=performance.now()+10000;
      $('synthLab').scrollIntoView({behavior:reduced?'instant':'smooth',block:'start'});document.querySelector(`[data-synth-mode="${index}"]`)?.focus({preventScroll:true});return;
    }
    if(d.contextJump){
      const [si,ni,li]=d.contextJump.split(',').map(Number),link=movement().stages[si]?.insights?.[ni]?.links?.[li];if(!link)return;
      const mi=link.movement!==undefined?D.movements.findIndex(m=>m.id===link.movement):state.index;if(mi<0)return;
      const targetStage=D.movements[mi].stages.find(s=>s.id===link.stageId),base=link.time??targetStage?.start;
      if(!Number.isFinite(base))return;
      const target=E.mapTime(base,D.movements[mi].duration,sources[mi].duration,state.calibrations[sources[mi].key]||{});
      state.loop=null;
      if(mi===state.index){renderToggles();seek(target,true,{referenceTime:base});}
      else loadMovement(mi,{time:target,referenceTime:base,autoplay:true});
      return;
    }
    if(d.score!==undefined){showScore(+d.score);return;}
    if(d.movement!==undefined){loadMovement(+d.movement,{autoplay:wantsPlayback()});return;}
    if(d.view){setView(d.view);return;}
    if(d.filter){state.filter=d.filter;renderFilters();renderTimeline();return;}
    if(d.stage!==undefined){playStage(+d.stage);return;}
    if(d.cue!==undefined){if(state.loop){state.loop=null;renderToggles();}seek(mappedTime(+d.cue),true,{referenceTime:+d.cue});return;}
    if(d.bookmark!==undefined){const key=keyFor(state.index,stages[+d.bookmark].id);state.bookmarks=state.bookmarks.includes(key)?state.bookmarks.filter(x=>x!==key):[...state.bookmarks,key];store();renderTimeline();return;}
    if(d.calibrate!==undefined){showCalibration(+d.calibrate);return;}
    if(d.saveAnchor!==undefined){saveAnchor(+d.saveAnchor);return;}
    if(d.deleteAnchor!==undefined){deleteAnchor(+d.deleteAnchor);return;}
    if(d.motif!==undefined){const motif=movement().motifs[+d.motif],base=motif.audioStart??(movement().stages[motif.stageIndex]?.start||0);state.loop=null;seek(mappedTime(base),true,{referenceTime:base});renderToggles();return;}
    if(d.motifLoop!==undefined){const motif=movement().motifs[+d.motifLoop],base=motif.audioStart??(movement().stages[motif.stageIndex]?.start||0),start=mappedTime(base);setLoop({start,end:Math.min(source().duration,start+15),index:motif.stageIndex||0,referenceStart:base});seek(start,true,{referenceTime:base});renderToggles();return;}
    if(d.cross){const [mi,si]=d.cross.split(',').map(Number);setView('map');const target=E.mappedStages(D.movements[mi],sources[mi].duration,state.calibrations[sources[mi].key]||{})[si]?.start||0;loadMovement(mi,{time:target,referenceTime:D.movements[mi].stages[si]?.start||0,autoplay:true});return;}
    if(d.nextCard){loadMovement(state.index+1,{autoplay:wantsPlayback()});return;}
    if(d.restore!==undefined){const i=+d.restore;if(sources[i].custom)URL.revokeObjectURL(sources[i].url);const m=D.movements[i];sources[i]={url:asset(m.audio||`assets/movement-${m.id}.mp3`),key:m.audio||`assets/movement-${m.id}.mp3`,duration:m.duration,name:'Pierre Boulez · Wiener Philharmoniker (DG 1996)',custom:false};if(i===state.index){loadMovement(i,{scroll:false});closeDialog();}else showSettings();return;}
    if(d.synthMode!==undefined){stopSynth();synthMode=+d.synthMode;renderSynth();return;}
    if(d.trackMute!==undefined){const ti=+d.trackMute,key=`${movement().id}-${synthMode}-${ti}`;synthMuted[key]=!synthMuted[key];if(synthTrackGains[ti])synthTrackGains[ti].gain.value=synthMuted[key]?0:1;renderSynth();return;}
    if(d.synthReal){const sec=getSynthModes()[synthMode]?.realJumpSec;if(sec===undefined)return;state.loop=null;renderToggles();seek(mappedTime(sec),true,{referenceTime:sec});return;}
    if(d.action==='settings'){showSettings();return;}
    if(d.action==='sources'){showSources();return;}
    if(d.action==='glossary'){showGlossary();return;}
    if(d.action==='overview'){showOverview();return;}
    if(d.action==='synth-play'){playSynth();return;}
    if(d.action==='save-offset'){
      const offset=Number($('chapterOffset').value);
      if(!Number.isFinite(offset)||Math.abs(offset)>source().duration/2){toast(t('请输入有效的秒数，偏移应小于半个乐章。','Enter a valid offset under half a movement duration.'));return;}
      const updated={...calibration(),offset},mapped=E.mappedStages(movement(),source().duration,updated);
      if(mapped.some((s,i)=>s.start>=source().duration-.05||(i>0&&s.start-mapped[i-1].start<=.05))){toast(t('偏移后有段落重叠或超出音轨，请减小偏移。','Offset causes stage overlap; please reduce offset.'));return;}
      state.calibrations[source().key]=updated;state.loop=null;rebuildStages();renderMovement();store();closeDialog();toast(t('已更新本章定位偏移。','Offset updated.'));return;
    }
    if(d.action==='reset-calibration'){delete state.calibrations[source().key];state.loop=null;rebuildStages();renderMovement();store();closeDialog();toast(t('已恢复本章默认定位。','Reset to default timing.'));return;}
    if(d.action==='export-calibration')exportCalibration();
  });

  document.addEventListener('change',event=>{
    const input=event.target;
    if(input.matches('input[data-import]'))importTrack(+input.dataset.import,input.files[0]);
    else if(input.matches('input[data-continuous-option]')){state.continuous=input.checked;renderToggles();store();}
  });

  $('play').onclick=togglePlay;$('back5').onclick=()=>seek(currentAudioTime()-5);$('forward5').onclick=()=>seek(currentAudioTime()+5);
  $('prevMovement').onclick=()=>loadMovement(state.index-1,{autoplay:wantsPlayback()});$('nextMovement').onclick=()=>loadMovement(state.index+1,{autoplay:wantsPlayback()});
  $('startFromBeginning').onclick=()=>{state.loop=null;renderToggles();seek(0,true);};
  $('follow').onclick=()=>{state.follow=!state.follow;state.manualUntil=0;renderToggles();store();if(state.follow)followCurrent({force:true});};
  $('continuous').onclick=()=>{state.continuous=!state.continuous;renderToggles();store();};
  $('loop').onclick=()=>{if(state.loop){state.loop=null;}else if(setLoop({...E.stageBounds(stages,state.active,source().duration),index:state.active})){const curT=currentAudioTime();if(curT<state.loop.start||curT>=state.loop.end)seek(state.loop.start);}renderToggles();};
  $('themeBtn').onclick=()=>{state.theme=state.theme==='dark'?'light':'dark';renderToggles();drawWave();store();};
  $('speed').onchange=()=>{state.speed=Number($('speed').value);audio.playbackRate=state.speed;store();};
  $('mute').onclick=()=>{audio.muted=!audio.muted;renderToggles();};
  $('scrub').oninput=()=>{state.loop=null;renderToggles();seek(+$('scrub').value);};
  $('scrub').onpointermove=e=>{const box=$('scrub').getBoundingClientRect(),ratio=E.clamp((e.clientX-box.left)/box.width,0,1);$('waveHover').hidden=false;$('waveHover').textContent=fmt(ratio*source().duration);$('waveHover').style.left=`${Math.min(box.width-45,Math.max(0,ratio*box.width-20))}px`;};
  $('scrub').onpointerleave=()=>$('waveHover').hidden=true;
  $('closeDialog').onclick=closeDialog;
  $('dialog').addEventListener('click',event=>{if(event.target===$('dialog')){const r=$('dialog').getBoundingClientRect();if(event.target===$('dialog')&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))closeDialog();}});
  audio.addEventListener('timeupdate',audioTick);
  audio.addEventListener('seeked',()=>{
    pendingSeek=null;
    const curT=audio.currentTime||0;
    const idx=E.stageAt(stages,curT);
    const changed=idx!==state.active;
    state.active=idx;
    state.positions[source().key]=curT;
    renderTelemetry();
    updateClock();
    if(changed)followCurrent();
  });
  audio.addEventListener('ended',ended);audio.addEventListener('play',()=>{stopSynth();updateClock();followCurrent();});audio.addEventListener('pause',()=>{updateClock();store();});audio.addEventListener('error',()=>{pausePlayback();toast(t('音轨未能载入。请检查文件或在「音源与校准」替换音轨。','Audio failed to load. Check file or replace in Settings.'));});audio.addEventListener('waiting',()=>{$('play').title=t('音频缓冲中','Buffering audio');});audio.addEventListener('playing',()=>{$('play').title=t('暂停','Pause');});audio.addEventListener('volumechange',renderToggles);
  window.addEventListener('resize',drawWave);
  window.addEventListener('wheel',e=>{if(!e.target?.closest?.('#console'))state.manualUntil=performance.now()+4000;},{passive:true});
  window.addEventListener('touchmove',e=>{if(!e.target?.closest?.('#console'))state.manualUntil=performance.now()+4000;},{passive:true});
  window.addEventListener('pagehide',()=>{pausePlayback();stopSynth();store();});
  window.addEventListener('keydown',event=>{if(event.code==='Escape'){stopSynth();return;}if(event.target.closest('input,select,textarea,button,a,summary')||$('dialog').open)return;if(event.code==='Space'){event.preventDefault();togglePlay();}else if(event.code==='ArrowLeft'){event.preventDefault();seek(currentAudioTime()-5);}else if(event.code==='ArrowRight'){event.preventDefault();seek(currentAudioTime()+5);}});
  
  const parseHash=()=>{const q=new URLSearchParams(location.hash.slice(1)),rawTime=Number(q.get('time'));return {index:Math.round(E.clamp((Number(q.get('movement'))||1)-1,0,D.movements.length-1)),time:Number.isFinite(rawTime)?Math.max(0,rawTime):0};};
  window.addEventListener('hashchange',()=>{if(hashBusy||!new URLSearchParams(location.hash.slice(1)).has('movement'))return;const h=parseHash();loadMovement(h.index,{time:h.time,autoplay:false});});
  renderThreads();const initial=parseHash();loadMovement(initial.index,{time:initial.time,scroll:false});
})();
