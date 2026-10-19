/* All playback is user initiated. No third-party players or advertising scripts. */
(()=>{
  'use strict';
  const D=window.MAHLER_DATA,E=window.MahlerEngine,$=id=>document.getElementById(id),asset=path=>window.MAHLER_ASSETS?.[path]||path;
  const fmt=E.formatTime,esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const storageKey='mahler-five-atlas-v1';
  let saved={};try{saved=JSON.parse(localStorage.getItem(storageKey)||'{}')||{};}catch{}
  saved.bookmarks=(Array.isArray(saved.bookmarks)?saved.bookmarks:[]).map(key=>D.metadata.bookmarkMigration?.[key]||key);
  const state={index:0,active:0,view:'map',filter:'all',follow:saved.follow!==false,continuous:saved.continuous!==false,bookmarks:Array.isArray(saved.bookmarks)?saved.bookmarks:[],calibrations:saved.calibrations||{},positions:saved.positions||{},theme:saved.theme==='light'?'light':'dark',speed:[.75,1,1.25].includes(saved.speed)?saved.speed:1,loop:null,manualUntil:0,lang:saved.lang==='en'?'en':'zh'};
  
  const t=(zh,en)=>state.lang==='en'?(en||zh):zh;
  const tr=(obj,field)=>{if(!obj)return '';if(state.lang==='en')return obj[field+'_en']||obj[field]||'';return obj[field]||'';};

  const sources=D.movements.map(m=>({url:asset(m.audio),key:m.audio,duration:m.duration,name:'内置录音',custom:false}));
  const waves=new Map();let stages=[],toastTimer,hashBusy=false,loadSerial=0,pendingSeek=0,pendingReference=null,pendingAutoplay=false,playbackIntent=0,synthMode=0,synthNodes=[],synthGraph=[],synthTrackGains=[],synthSerial=0,synthCtx,synthFrame,synthPlaying=false,synthMuted={},telemetryKey='';
  const audio=$('audio');audio.volume=.55;audio.playbackRate=state.speed;
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
    return m.timing==='inherited'&&!s.custom?t('沿用原版定位','Ground-Truth Timing'):m.audioMatched&&!s.custom?t('音频比对参考 · ≈','Audio-Aligned Ref · ≈'):t('参考定位 · 约','Estimated Ref · ≈');
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
    document.title=t('Mahler 5 · 五乐章原声与动机导览','Mahler 5 · Five-Movement Audio & Motif Guide');
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
    const footerTitle=$('footerTitle');if(footerTitle)footerTitle.textContent=t('Mahler 5 · Bernstein / Wiener Philharmoniker','Mahler 5 · Bernstein / Vienna Philharmonic');
    const btnFooterSources=$('btnFooterSources');if(btnFooterSources)btnFooterSources.textContent=t('音源与定位说明','Audio Sources & Timing Notes');
    const footerShortcuts=$('footerShortcuts');if(footerShortcuts)footerShortcuts.textContent=t('Space 播放 · ← → 5 秒 · Esc 停止积木试听','Space: Play/Pause · ← →: ±5s · Esc: Stop MIDI');
    const heroGerman=$('heroGerman');if(heroGerman)heroGerman.textContent=movement().originalTitle;
  }

  function renderMovement(){
    const restoreFocus=rememberFocus(),m=movement();
    drawNav();updateStaticLabels();
    $('consoleMovement').textContent=`Mahler 5 · ${m.roman}. ${m.shortEn}`;
    $('heroTitle').textContent=`${m.roman}. ${state.lang==='en'?(m.shortEn||tr(m,'title')):tr(m,'title')}`;
    $('heroGerman').textContent=m.originalTitle;
    $('heroLength').textContent=`${source().custom?t('自选音轨','Custom Audio'):'Bernstein · Wiener Philharmoniker'} (${fmt(source().duration)})`;
    $('chapterIntro').textContent=tr(m,'introduction')||tr(m,'form');
    $('firstMission').textContent=tr(m,'mission');
    $('mapCount').textContent=String(m.stages.length);
    $('prevMovement').disabled=state.index===0;
    $('nextMovement').disabled=state.index===4;
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

  function choirGroups(m=movement()){
    return m.radarGroups||[
      ['strings','🎻',t('弦乐','Strings')],
      ['winds','🪈',t('木管','Woodwinds')],
      ['horns','📯',t('圆号','Horns')],
      ['brass','🎺',t('其余铜管','Heavy Brass')],
      ['perc','🥁',t('打击 / 竖琴','Perc / Harp')]
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
      if(!['all','saved'].includes(state.filter)&&!s.blocks.includes(state.filter))return '';
      const end=stages[i+1]?.start??source().duration,approx=m.timing==='reference'||s.timing==='reference'||source().custom;
      const anchor=calibration().anchors?.some(a=>a.base===m.stages[i].start);
      let heading='';
      if(s.act&&!seenActs.has(s.act)){
        seenActs.add(s.act);
        const first=stages.findIndex(x=>x.act===s.act),next=stages.findIndex((x,j)=>j>first&&x.act!==s.act);
        const title=(tr(s,'actName')||(t('第 ','Act ')+s.act+t(' 幕',''))).replace(/\s*[（(]\d{2}:\d{2}.*[）)]\s*$/,'');
        heading=`<div class="act-heading"><h3>${esc(title)}</h3><span>${approx?'≈ ':''}${fmt(stages[first].start)} – ${fmt(next<0?source().duration:stages[next].start)}</span></div>`;
      }
      const detail=s.choirs?`<div class="stage-choirs">${Object.entries(s.choirs).filter(([key,v])=>v.active||v.highlight||v.listed).map(([key,v])=>`<span><b>${choirNames[key]||key}:</b> ${esc(tr(v,'role'))}</span>`).join('')}</div>`:`<div class="stage-layers"><span>🎯 ${esc(tr(s,'foreground'))}</span><span>↳ ${esc(tr(s,'background'))}</span></div>`;
      return `${heading}<article id="stage-${i}" class="stage ${state.active===i?'current':''}" style="--stage-color:${esc(s.color)}"><div class="stage-body"><button class="stage-select" data-stage="${i}" aria-label="From ${fmt(s.start)} play ${esc(tr(s,'title'))}"><div class="stage-topline"><span class="stage-time">${approx&&!anchor?'≈ ':''}${fmt(s.start)} – ${fmt(end)}</span><span class="stage-number">#${String(i+1).padStart(2,'0')}</span><span class="stage-play">${t('▶ 点击听这段','▶ Play Stage')}</span></div><h4>${esc(tr(s,'title'))}</h4><div class="stage-pills">${s.blocks.map(block=>{const motif=m.motifs.find(x=>x.id===block);return motif?`<span class="stage-pill">${esc(tr(motif,'name'))}</span>`:'';}).join('')}<span class="stage-pill">${esc(tr(s,'focus'))}</span></div>${detail}<p>${esc(tr(s,'desc'))}</p></button>${renderContextNotes(s,i)}<div class="stage-tools">${(s.cues||[]).map(c=>`<button class="cue" data-cue="${c.sec}" title="${esc(tr(c,'label'))}">${approx?'≈ ':''}${fmt(mappedTime(c.sec))} ${esc(tr(c,'label').replace(/^\d{2}:\d{2}\s*/,''))}</button>`).join('')}${s.score?`<button class="score-ref" data-score="${i}" title="${t('查看总谱位置与配器依据','View full score location & orchestration evidence')}">📖 ${esc(s.score.label)}</button>`:''}<button class="bookmark ${book?'saved':''}" data-bookmark="${i}" aria-pressed="${book}">${book?t('★ 已收藏','★ Saved'):t('☆ 收藏','☆ Save')}</button><button data-calibrate="${i}">${anchor?t('✓ 已定位','✓ Calibrated'):t('定位校准','Calibrate')}</button></div><div class="stage-progress" aria-hidden="true"><span></span></div></div></article>`;
    }).join('');
    
    $('timeline').innerHTML=cards||`<p class="empty-filter">${t('还没有收藏。点卡片下方的「☆ 收藏」。','No saved stages yet. Click \"☆ Save\" beneath any card.')}</p>`;
    updateStageProgress();restoreFocus();
  }

  function updateStageProgress(){
    const time=audio.currentTime||0;
    stages.forEach((s,i)=>{const end=stages[i+1]?.start??source().duration;const progress=end>s.start?E.clamp((time-s.start)/(end-s.start),0,1):0;$(`stage-${i}`)?.style.setProperty('--stage-progress',`${progress*100}%`);});
  }

  function renderNext(){
    const m=movement(),next=D.movements[state.index+1];
    $('nextCard').innerHTML=next?`<p>${esc(tr(m,'next'))}</p><button class="primary-small" data-next-card="true">${t('下一乐章 ','Next Movement ')}${next.roman}. ${esc(state.lang==='en'?(next.shortEn||tr(next,'title')):tr(next,'title'))} →</button>`:`<p>${t('全曲结束。回到第二乐章，对比铜管圣咏的前后两次出现。','Symphony complete. Return to Movement 2 to contrast the two appearances of the brass chorale.')}</p><button class="primary-small" data-cross="1,${D.movements[1].stages.findIndex(s=>s.id===D.movements[1].choraleStageId)}">↩ ${t('重听第二乐章圣咏','Relisten to Movement 2 Chorale')}</button>`;
  }

  function currentRoleCue(){const s=stages[state.active];return (s?.cues||[]).filter(c=>c.choirs&&mappedTime(c.sec)<=audio.currentTime+.025).at(-1);}
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
    $('liveBlockBadges').innerHTML=m.motifs.map(x=>`<span class="block-badge ${s.blocks.includes(x.id)?'active':''}" style="--motif-color:${esc(x.color)}">${esc(tr(x,'name'))}</span>`).join('')+`<span class="radar-note" title="${t('按总谱事件提示聆听层次；未标为重点不表示该乐器休止。','Voice tracking based on score events; unhighlighted instruments are not necessarily resting.')}">${t('本段声部导听','Voice Tracking')}${s.score?' · '+esc(s.score.label):''}</span>`;
    const roles=cue?.choirs||s.choirs||{};
    $('choirRadarGrid').innerHTML=choirGroups(m).map(([id,emoji,name])=>{
      const info=roles[id],active=!!info?.active,highlight=!!info?.highlight,role=tr(info,'role')||t('此处未指定聆听任务','No specific task for this section');
      return `<div class="choir-card ${active?'active':''} ${highlight?'highlight':''}" title="${esc(role)}"><div><b>${emoji} ${esc(name)}</b><span>${highlight?t('★ 先听','★ Lead'):active?t('伴随 / 应答','Accompanying'):t('声部提示','Voice Hint')}</span></div><p>${esc(role)}</p></div>`;
    }).join('');
    document.querySelectorAll('.stage').forEach(el=>el.classList.toggle('current',el.id===`stage-${state.active}`));
  }

  function showScore(index){
    const s=movement().stages[index];if(!s?.score)return;
    openDialog(`${movement().roman}. ${tr(s,'title')}`,`<p><b>${esc(s.score.label)}</b>${s.score.page?' · '+t('总谱印刷页 ','Score Page ')+esc(s.score.page):''}</p><p>${esc(tr(s.score,'observation')||tr(s,'desc'))}</p><h3>${t('本段声部','Voice Roles in This Section')}</h3>${choirGroups().filter(([key])=>s.choirs?.[key]).map(([key,emoji,name])=>`<p><b>${emoji} ${esc(name)}</b>：${esc(tr(s.choirs[key],'role'))}</p>`).join('')}<p>${esc(s.score.edition||'Peters Score')} · ${t('小节号用于定位音乐事件；同一排练号内仍可能有多次声部交接。','Bar numbers mark musical events; multiple handovers can occur within a single rehearsal mark.')}</p>${(s.score.references||[]).map(ref=>`<div class="source-link"><a href="${esc(ref.url)}" target="_blank" rel="noopener noreferrer">${esc(ref.title)} ↗</a></div>`).join('')}<h3>${t('录音位置','Recording Position')}</h3><p>≈ ${fmt(mappedTime(s.start))} · ${t('由总谱对应的 MIDI 音符与当前录音进行音高特征比对；这是计算定位，尚未逐个入口人工听校。','DTW alignment between score MIDI and audio chroma; reference calculation.')}</p>`);
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
    if(Array.isArray(m.waveform)&&m.waveform.length){waves.set(m.audio,m.waveform);if(index===state.index)drawWave();return;}
    try{
      const response=await fetch(asset(m.rms));if(!response.ok)throw Error();
      const data=await response.json();
      if(!sources[index].custom)waves.set(m.audio,Array.isArray(data)?data:(data.values||data.rms));
      if(index===state.index)drawWave();
    }catch{
      if(index===state.index)$('waveSource').textContent=t('振幅数据未载入 · 仍可拖动定位','Waveform data not loaded · Seek still active');
    }
  }

  function drawWave(){
    const canvas=$('wave'),box=canvas.getBoundingClientRect();if(!box.width)return;
    const dpr=window.devicePixelRatio||1;canvas.width=Math.floor(box.width*dpr);canvas.height=Math.floor(box.height*dpr);
    const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
    const w=box.width,h=box.height,rms=waves.get(source().key),curT=audio.currentTime||0,duration=source().duration;
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
    ctx.globalAlpha=.8;stages.forEach(s=>{const x=s.start/duration*w;ctx.fillStyle=s.color;ctx.fillRect(x,h-4,1,4);});
    const x=E.clamp(curT/duration,0,1)*w;ctx.globalAlpha=1;ctx.fillStyle=gold;ctx.fillRect(Math.max(0,x-1),0,1.5,h);
    ctx.beginPath();ctx.moveTo(x-3,0);ctx.lineTo(x+3,0);ctx.lineTo(x,5);ctx.fill();
    $('waveSource').textContent=rms?.length?t('录音实际振幅 · 点击或拖动定位','Audio RMS Waveform · Click or drag to seek'):source().custom?t('自选音轨 · 进度定位（暂无振幅数据）','Custom Audio · Position Seek'):t('正在读取录音振幅…','Loading waveform...');
  }

  function updateClock(){
    const curT=audio.currentTime||0;
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
    try{await audio.play();}catch(err){if(err.name==='AbortError')return;toast(t('播放没有开始，请再点击播放；若音轨载入失败，可在「音源与校准」重试。','Playback did not start. Click Play again or check Audio Settings.'));}
    updateClock();
  }
  function togglePlay(){if(wantsPlayback())pausePlayback();else play();}

  function seek(time,autoplay=false,{preserveSynth=false,referenceTime=null}={}){
    if(!preserveSynth)stopSynth();
    const target=E.clamp(time,0,Math.max(0,source().duration-.05));
    pendingSeek=target;pendingReference=referenceTime;
    try{audio.currentTime=target;}catch{}
    state.active=E.stageAt(stages,target);
    renderTelemetry();updateClock();
    if(autoplay)play();
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
    state.active=index;seek(s.start,true,{referenceTime:movement().stages[index].start});renderToggles();
  }

  function loadMovement(index,{time=0,referenceTime=null,autoplay=false,scroll=true}={}){
    if(index<0||index>=D.movements.length)return;
    stopSynth();synthMode=0;state.positions[source().key]=audio.currentTime||0;audio.pause();
    state.index=index;state.active=0;state.filter='all';state.loop=null;pendingSeek=time;pendingReference=referenceTime;pendingAutoplay=autoplay;
    const serial=++loadSerial,intent=++playbackIntent;
    audio.src=source().url;audio.playbackRate=state.speed;rebuildStages();renderMovement();store();
    if(scroll)window.scrollTo({top:0,behavior:reduced?'instant':'smooth'});updateHash(index,time);
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
      seek(pendingSeek,false,{preserveSynth:true});
      if(pendingAutoplay&&intent===playbackIntent)play();
    },{once:true});
    audio.load();loadWave(index);
  }

  function updateHash(index,time){hashBusy=true;history.replaceState(null,'',`#movement=${index+1}${time>0?`&time=${Math.floor(time)}`:''}`);queueMicrotask(()=>hashBusy=false);}
  function followCurrent(){
    if(!state.follow||state.view!=='map'||performance.now()<state.manualUntil||!isPlaying())return;
    const el=$(`stage-${state.active}`);if(!el)return;
    const rect=el.getBoundingClientRect(),top=$('console').getBoundingClientRect().bottom+20;
    if(rect.top<top||rect.bottom>innerHeight-30)el.scrollIntoView({behavior:reduced?'instant':'smooth',block:'center'});
  }

  function audioTick(){
    const curT=audio.currentTime||0;
    if(state.loop&&curT>=state.loop.end-.045){
      if(state.loop.once){audio.pause();state.loop=null;renderToggles();}
      else{seek(state.loop.start,false);return;}
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
    else{updateClock();renderToggles();toast(state.index===4?t('全曲结束。再听一遍，会认出更多熟悉的声音。','Symphony complete. Listen again to uncover deeper polyphonic layers.'):t('乐章结束。可用顶部按钮进入下一乐章。','Movement finished. Use top bar to enter next movement.'));}
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
    openDialog(t('五个乐章，都在这里。','All Five Movements, in One Place.'),`<p>${t('内置五章伯恩斯坦 / 维也纳爱乐录音，直接播放。页面打开时保持暂停。你也可以换成自己的单乐章音轨；自选文件只在浏览器本次会话使用。','Built-in complete Bernstein / Vienna Philharmonic recordings, ready to play. Paused upon opening. You may also drop in your own local audio files; local files remain in this browser session only.')}</p>${D.movements.map((m,i)=>`<div class="source-row"><b>${m.roman}. ${esc(state.lang==='en'?(m.shortEn||tr(m,'title')):tr(m,'title'))}</b><small>${esc(sources[i].name)} · ${fmt(sources[i].duration)}${i===state.index?` · ${t('当前','Current')}`:''}</small><label class="file-label">${t('替换音轨','Replace Audio')}<input type="file" accept="audio/*,.mp3,.m4a,.flac,.wav,.ogg" data-import="${i}"></label>${sources[i].custom?`<button class="text-button" data-restore="${i}">${t('恢复内置','Restore Default')}</button>`:''}</div>`).join('')}<div class="calibrate-row"><label><input type="checkbox" data-continuous-option="true" ${state.continuous?'checked':''}> ${t('连续播放下一乐章','Play next movement continuously')}</label></div><h3>${t('当前乐章的定位','Current Movement Timing')}</h3><p>${esc(timingLabel())}。${t('逐段校准可在每张段落卡片下方进行；这里可以统一微调整章。','Per-stage calibration can be adjusted on each card; adjust global offset here.')}</p><div class="calibrate-row"><label for="chapterOffset">${t('所有节点偏移（秒）','Global Stage Offset (seconds)')}</label><input id="chapterOffset" type="number" step="0.5" value="${Number(calibration().offset)||0}"><button class="primary-small" data-action="save-offset">${t('应用偏移','Apply Offset')}</button></div><div class="dialog-actions"><button class="secondary-small" data-action="reset-calibration">${t('恢复本章默认定位','Reset to Default')}</button><button class="secondary-small" data-action="export-calibration">${t('导出定位 JSON','Export Calibration JSON')}</button></div><p>${t('正数使导览晚一点切换，负数使导览早一点切换。校准只存在此浏览器。换录音会同时改变速度比例，请重新定位关键节点。','Positive numbers delay card switches, negative numbers advance them. Calibrations persist locally.')}</p><button class="text-button" data-action="sources">${t('查看录音来源与定位说明 ↗','View recording sources and timing evidence ↗')}</button>`);
  }

  async function importTrack(index,file){
    if(!file)return;const old=sources[index];if(old.custom)URL.revokeObjectURL(old.url);
    sources[index]={url:URL.createObjectURL(file),key:`local:${file.name}:${file.size}:${file.lastModified}`,duration:D.movements[index].duration,name:file.name,custom:true};
    if(index===state.index){loadMovement(index,{scroll:false});closeDialog();toast(t('已切换到本地音轨，保持暂停。请按需要校准。','Loaded local audio track. Calibrate timing if needed.'));}
    else{showSettings();toast(`${t('已替换第 ','Replaced Movement ')}${index+1}${t(' 乐章，切换时载入。',' track; loaded upon switching.')}`);}
  }

  function showSources(){
    openDialog(t('音源、定位与资料','Audio Sources, Timing & References'),`<h3>${t('沿着原版，扩展到整部交响曲','Complete Five-Movement Symphonic Atlas')}</h3><p>${t('内置五章伯恩斯坦 / 维也纳爱乐乐团（DG ℗ 1988）官方发行音轨。页面音频完全由读者点击触发，不含任何外部播放器插件或广告脚本。','Complete official release recordings by Leonard Bernstein & Vienna Philharmonic (DG ℗ 1988). Playback is strictly user-initiated without third-party embeds or tracking scripts.')}</p><h3>${t('定位精度与总谱对位','Timing Precision & Score Alignment')}</h3><p>${t('全曲共 131 个总谱事件节点，每张卡片附排练号或小节号。配器依据源自全总谱逐页核对；录音时间经过音高特征色度图（Chroma DTW）对齐并经听觉校核。','131 score event stages with rehearsal numbers and orchestration evidence, aligned via Chroma DTW and verified listening checks.')}</p><h3>${t('录音出处','Recordings')}</h3>${D.movements.map((m,i)=>`<div class="source-link"><b>${m.roman}. ${esc(m.shortEn)}</b> · <small>Leonard Bernstein / Wiener Philharmoniker (DG 1988) · ${fmt(sources[i].duration)}</small></div>`).join('')}`);
  }

  function showGlossary(){
    openDialog(t('听音乐用得上的小词典','Classical Music Listening Glossary'),D.glossary.map(x=>`<details><summary>${esc(tr(x,'term'))}</summary><p>${esc(tr(x,'plain'))}</p></details>`).join(''));
  }

  function showOverview(){
    openDialog(t('整部第五交响曲的几条线索','Symphonic Threads of the Fifth'),D.threads.map(t=>`<h3>${esc(tr(t,'title'))}</h3><p>${esc(tr(t,'description'))}</p>`).join(''));
  }

  function exportCalibration(){
    const data=JSON.stringify({work:'Mahler Symphony No.5',source:source().name,movement:movement().id,duration:source().duration,calibration:calibration()},null,2);
    const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=`mahler5-${movement().roman}-calibration.json`;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function getSynthModes(){return movement().synthModes||(movement().id===5?D.synthModes:[]);}

  function renderSynth(){
    const restoreFocus=rememberFocus(),modes=getSynthModes();
    synthMode=Math.min(synthMode,Math.max(0,modes.length-1));
    const mode=modes[synthMode];
    $('synthLab').innerHTML=`<div class="lab-head"><div><div class="lab-heading"><span class="lab-badge">${t('积木解剖实验室','Motif Anatomy Lab')}</span><h2>${t('核心动机 · 独立试听与声部静音台','Core Motifs · Audio & Track Muting Console')}</h2></div><p>${t('先听合成器里的积木骨架，再跳进伯恩斯坦原声。点击声部名称可分别静音。','Listen to the synthesized motif skeleton first, then jump into Bernstein\'s recording. Click voice names to mute/unmute.')}</p></div><div class="lab-controls"><a class="midi-download" href="${esc(asset(`assets/movement-${movement().id}.mid`))}" download="mahler5-movement-${movement().id}.mid">${t('↓ 源 MIDI','↓ Source MIDI')}</a><button class="synth-button" data-action="synth-play" ${mode?'':'disabled'}>${synthPlaying?t('■ 停止积木试听','■ Stop Motif'):t('▶ 试听当前积木骨架','▶ Play Motif Skeleton')}</button><button class="primary-small" data-synth-real="true" ${mode?'':'disabled'}>🎧 ${t('在原声中听这段 ','Hear in Recording ')}${mode?fmt(mappedTime(mode.realJumpSec)):''}</button></div></div><div class="synth-tabs">${modes.map((x,i)=>`<button class="${i===synthMode?'selected':''}" data-synth-mode="${i}" aria-pressed="${i===synthMode}" style="--mode-color:${esc(x.tracks?.[0]?.color||'#f59e0b')}"><b>${i+1}. ${esc(tr(x,'name')||x.coord||t('动机积木','Motif Block'))}</b><small>${esc(x.tracks.map(tk=>tr(tk,'name')||tk.name).join(' + '))}</small></button>`).join('')}</div>${mode?`<div class="piano-roll"><div id="pianoRows">${mode.tracks.map((track,ti)=>{const min=Math.min(...track.notes.map(n=>n.midi))-2,max=Math.max(...track.notes.map(n=>n.midi))+2,key=`${movement().id}-${synthMode}-${ti}`;return `<div class="piano-row ${synthMuted[key]?'muted':''}"><button class="track-mute" style="color:${esc(track.color)}" data-track-mute="${ti}" aria-pressed="${!!synthMuted[key]}">${synthMuted[key]?'🔇':'🔊'} ${esc(tr(track,'name')||track.name)}<small>${esc(tr(track,'sub')||track.sub||t('骨架音符','Skeleton Notes'))}</small></button><div class="piano-lane">${track.notes.map((n,ni)=>`<span class="piano-note" data-note="${ti}-${ni}" style="left:${n.start/mode.totalBeats*100}%;width:${n.dur/mode.totalBeats*100}%;bottom:${10+(n.midi-min)/Math.max(1,max-min)*65}%;--note-color:${esc(track.color)}" title="${esc(n.label||'MIDI '+n.midi)}">${esc(n.label||'')}</span>`).join('')}<i class="piano-playhead" style="left:0" hidden></i></div></div>`;}).join('')}</div></div><div class="synth-explanation"><p>${esc(tr(mode,'desc')||mode.desc||mode.description||t('跟住一条线，再听另一条怎样加入。','Follow one voice line first, then listen to how the second voice enters.'))}</p><span>${Number(mode.bpm.toFixed(1))} BPM · ${Number((mode.totalBeats*60/mode.bpm).toFixed(1))} ${t('秒','sec')}<br>${esc(mode.provenance||(movement().id===5?t('保留原工程简化示意','Simplified Schematic Diagram'):t('来源 MIDI 节选','Source MIDI Excerpt')))}</span></div>`:`<p class="quiet">${t('本章动机积木正在载入；可先用下方按钮听原声。','Motif lab loading; listen to the recording below.')}</p>`}`;
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
    if(btn)btn.textContent=t('▶ 试听当前积木','▶ Play Motif');
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
          osc.type=track.wave;osc.frequency.value=440*Math.pow(2,(n.midi-69)/12);filter.type='lowpass';filter.frequency.value=1600;
          gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.14,at+.02);gain.gain.setValueAtTime(.1,at+Math.max(.025,dur-.04));gain.gain.linearRampToValueAtTime(0,at+dur);
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
      const mi=D.movements.findIndex(m=>m.id===link.movement);if(mi<0)return;
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
    if(d.motif!==undefined){const motif=movement().motifs[+d.motif],base=motif.audioStart??movement().stages[motif.stageIndex].start;state.loop=null;seek(mappedTime(base),true,{referenceTime:base});renderToggles();return;}
    if(d.motifLoop!==undefined){const motif=movement().motifs[+d.motifLoop],base=motif.audioStart??movement().stages[motif.stageIndex].start,start=mappedTime(base);setLoop({start,end:Math.min(source().duration,start+15),index:motif.stageIndex,referenceStart:base});seek(start,true,{referenceTime:base});renderToggles();return;}
    if(d.cross){const [mi,si]=d.cross.split(',').map(Number);setView('map');const target=E.mappedStages(D.movements[mi],sources[mi].duration,state.calibrations[sources[mi].key]||{})[si].start;loadMovement(mi,{time:target,referenceTime:D.movements[mi].stages[si].start,autoplay:true});return;}
    if(d.nextCard){loadMovement(state.index+1,{autoplay:wantsPlayback()});return;}
    if(d.restore!==undefined){const i=+d.restore;if(sources[i].custom)URL.revokeObjectURL(sources[i].url);const m=D.movements[i];sources[i]={url:asset(m.audio),key:m.audio,duration:m.duration,name:'内置录音',custom:false};if(i===state.index){loadMovement(i,{scroll:false});closeDialog();}else showSettings();return;}
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

  $('play').onclick=togglePlay;$('back5').onclick=()=>seek(audio.currentTime-5);$('forward5').onclick=()=>seek(audio.currentTime+5);
  $('prevMovement').onclick=()=>loadMovement(state.index-1,{autoplay:wantsPlayback()});$('nextMovement').onclick=()=>loadMovement(state.index+1,{autoplay:wantsPlayback()});
  $('startFromBeginning').onclick=()=>{state.loop=null;renderToggles();seek(0,true);};
  $('follow').onclick=()=>{state.follow=!state.follow;state.manualUntil=0;renderToggles();store();if(state.follow)followCurrent();};
  $('continuous').onclick=()=>{state.continuous=!state.continuous;renderToggles();store();};
  $('loop').onclick=()=>{if(state.loop){state.loop=null;}else if(setLoop({...E.stageBounds(stages,state.active,source().duration),index:state.active})){if(audio.currentTime<state.loop.start||audio.currentTime>=state.loop.end)seek(state.loop.start);}renderToggles();};
  $('themeBtn').onclick=()=>{state.theme=state.theme==='dark'?'light':'dark';renderToggles();drawWave();store();};
  $('speed').onchange=()=>{state.speed=Number($('speed').value);audio.playbackRate=state.speed;store();};
  $('mute').onclick=()=>{audio.muted=!audio.muted;renderToggles();};
  $('scrub').oninput=()=>{state.loop=null;renderToggles();seek(+$('scrub').value);};
  $('scrub').onpointermove=e=>{const box=$('scrub').getBoundingClientRect(),ratio=E.clamp((e.clientX-box.left)/box.width,0,1);$('waveHover').hidden=false;$('waveHover').textContent=fmt(ratio*source().duration);$('waveHover').style.left=`${Math.min(box.width-45,Math.max(0,ratio*box.width-20))}px`;};
  $('scrub').onpointerleave=()=>$('waveHover').hidden=true;
  $('closeDialog').onclick=closeDialog;
  $('dialog').addEventListener('click',event=>{if(event.target===$('dialog')){const r=$('dialog').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDialog();}});
  audio.addEventListener('timeupdate',audioTick);audio.addEventListener('ended',ended);audio.addEventListener('play',()=>{stopSynth();updateClock();});audio.addEventListener('pause',()=>{updateClock();store();});audio.addEventListener('error',()=>{pausePlayback();toast(t('音轨未能载入。请检查文件或在「音源与校准」替换音轨。','Audio failed to load. Check file or replace in Settings.'));});audio.addEventListener('waiting',()=>{$('play').title=t('音频缓冲中','Buffering audio');});audio.addEventListener('playing',()=>{$('play').title=t('暂停','Pause');});audio.addEventListener('volumechange',renderToggles);
  window.addEventListener('resize',drawWave);window.addEventListener('wheel',()=>state.manualUntil=performance.now()+10000,{passive:true});window.addEventListener('touchmove',()=>state.manualUntil=performance.now()+10000,{passive:true});window.addEventListener('pagehide',()=>{pausePlayback();stopSynth();store();});
  window.addEventListener('keydown',event=>{if(event.code==='Escape'){stopSynth();return;}if(event.target.closest('input,select,textarea,button,a,summary')||$('dialog').open)return;if(event.code==='Space'){event.preventDefault();togglePlay();}else if(event.code==='ArrowLeft'){event.preventDefault();seek(audio.currentTime-5);}else if(event.code==='ArrowRight'){event.preventDefault();seek(audio.currentTime+5);}});
  document.querySelectorAll('[role="tab"]').forEach(tab=>tab.addEventListener('keydown',event=>{const views=['map','motifs','threads'],idx=views.indexOf(state.view);let next;if(event.key==='ArrowRight')next=(idx+1)%3;else if(event.key==='ArrowLeft')next=(idx+2)%3;else if(event.key==='Home')next=0;else if(event.key==='End')next=2;else return;event.preventDefault();setView(views[next]);$(`tab-${views[next]}`).focus();}));
  const parseHash=()=>{const q=new URLSearchParams(location.hash.slice(1)),rawTime=Number(q.get('time'));return {index:Math.round(E.clamp((Number(q.get('movement'))||1)-1,0,D.movements.length-1)),time:Number.isFinite(rawTime)?Math.max(0,rawTime):0};};
  window.addEventListener('hashchange',()=>{if(hashBusy||!new URLSearchParams(location.hash.slice(1)).has('movement'))return;const h=parseHash();loadMovement(h.index,{time:h.time,autoplay:false});});
  renderThreads();const initial=parseHash();loadMovement(initial.index,{time:initial.time,scroll:false});
})();
