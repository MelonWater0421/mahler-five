(function(root){
  'use strict';
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,Number(value)||0));
  const formatTime=seconds=>{seconds=Math.max(0,Math.floor((Number(seconds)||0)+1e-6));return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;};
  function mapTime(baseTime,referenceDuration,actualDuration,calibration={}){
    const ref=Number(referenceDuration)||1, actual=Number(actualDuration)||ref;
    const points=new Map([[0,0],[ref,actual]]);
    for(const anchor of calibration.anchors||[]) if(Number.isFinite(anchor.base)&&Number.isFinite(anchor.time)&&anchor.base>=0&&anchor.base<ref&&anchor.time>=0&&anchor.time<actual) points.set(anchor.base,anchor.time);
    const sorted=[...points].sort((a,b)=>a[0]-b[0]);
    let previous=-1;
    for(const point of sorted){if(point[1]<=previous) return clamp(baseTime/ref*actual+(Number(calibration.offset)||0),0,actual);previous=point[1];}
    const t=clamp(baseTime,0,ref);
    const right=sorted.findIndex(p=>p[0]>t);
    let result;
    if(right<0) result=sorted[sorted.length-1][1];
    else if(right===0) result=sorted[0][1];
    else{const a=sorted[right-1],b=sorted[right];result=a[1]+(t-a[0])/(b[0]-a[0])*(b[1]-a[1]);}
    return clamp(result+(Number(calibration.offset)||0),0,actual);
  }
  function mappedStages(movement,actualDuration,calibration){return movement.stages.map(stage=>({...stage,start:mapTime(stage.start,movement.duration,actualDuration,calibration)}));}
  function stageAt(stages,time){let found=0;for(let i=0;i<stages.length;i++){if(stages[i].start<=time+.025)found=i;else break;}return found;}
  function stageBounds(stages,index,duration){return {start:stages[index]?.start||0,end:stages[index+1]?.start??duration};}
  function rebaseCalibration(calibration={},duration){
    const offset=Number(calibration.offset)||0;
    const anchors=(calibration.anchors||[]).map(a=>({...a,time:clamp(a.time+offset,0,duration)}));
    if(offset>0&&!anchors.some(a=>a.base===0))anchors.push({base:0,time:clamp(offset,0,duration)});
    return {...calibration,offset:0,anchors};
  }
  function validateAnchor(stages,index,time,duration,calibration={}){
    if(!stages[index])return '请选择有效的段落。';
    if(!Number.isFinite(time)||time<0||time>=duration)return '定位必须落在音轨时长以内。';
    const base=stages[index].start;
    const points=[...(calibration.anchors||[]).filter(a=>a.base!==base),{base,time}].sort((a,b)=>a.base-b.base);
    let previous=-1;
    for(const point of points){
      if(!Number.isFinite(point.base)||!Number.isFinite(point.time)||point.base<0||point.time<0||point.time>=duration||(point.base>0&&point.time===0)||point.time<=previous)return '这个时间与相邻校准点或音轨边界的顺序冲突，请先修正相邻点或整体偏移。';
      previous=point.time;
    }
    return null;
  }
  function nextMovement(index,count,continuous){return continuous&&index<count-1?index+1:null;}
  const api={clamp,formatTime,mapTime,mappedStages,stageAt,stageBounds,rebaseCalibration,validateAnchor,nextMovement};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else {
    root.BrucknerEngine=api;
    root.MahlerEngine=api;
  }
})(typeof window!=='undefined'?window:globalThis);
