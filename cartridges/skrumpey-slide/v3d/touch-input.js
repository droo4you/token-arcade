/* Pointer ownership keeps a second finger on Jump from cancelling Dive or swiping.
   iOS drops pointer capture during a hold, so the hold is tracked until pointerup
   or touchend. Capture is only requested for mouse. */
(function(root){
  function createTouchInput({canvas,dive,jump,eventTarget,isPlaying,isLane,onJump,onLane,onActivate}){
    const pointers=new Map();
    const opts={passive:false};
    function begin(kind,e){
      if(!isPlaying() || (e.pointerType==='mouse' && e.button!==0))return;
      if(e.cancelable)e.preventDefault();
      onActivate();
      const lane=isLane();
      pointers.set(e.pointerId,{kind,x:e.clientX,y:e.clientY,lane,moved:false});
      if(e.pointerType==='mouse')e.currentTarget.setPointerCapture?.(e.pointerId);
      if(kind==='jump')onJump();
    }
    function end(e){
      const p=pointers.get(e.pointerId);
      if(!p)return;
      pointers.delete(e.pointerId);
      if(!isPlaying())return;
      if(p.kind==='canvas' && p.lane && isLane() && !p.moved && Math.hypot((e.clientX??p.x)-p.x,(e.clientY??p.y)-p.y)<28)onJump();
    }
    canvas.addEventListener('pointerdown',e=>begin('canvas',e),opts);
    dive.addEventListener('pointerdown',e=>begin('dive',e),opts);
    jump.addEventListener('pointerdown',e=>begin('jump',e),opts);
    eventTarget.addEventListener('pointermove',e=>{
      const p=pointers.get(e.pointerId);
      if(!p || p.kind!=='canvas' || p.moved)return;
      const dx=e.clientX-p.x,dy=e.clientY-p.y;
      if(Math.hypot(dx,dy)<28)return;
      p.moved=true;
      // Chase camera: screen-left is +lat (bit 8). Bit 4 steps the other way.
      if(isPlaying() && p.lane && isLane() && Math.abs(dx)>Math.abs(dy))onLane(dx<0?8:4);
    },opts);
    eventTarget.addEventListener('pointerup',end);
    eventTarget.addEventListener('pointercancel',end);
    eventTarget.addEventListener('touchend',e=>{for(const t of e.changedTouches)end({pointerId:t.identifier,clientX:t.clientX,clientY:t.clientY});},opts);
    eventTarget.addEventListener('touchcancel',e=>{for(const t of e.changedTouches)end({pointerId:t.identifier,clientX:t.clientX,clientY:t.clientY});},opts);
    const reset=()=>pointers.clear();
    eventTarget.addEventListener('blur',reset);
    return {reset,isHeld:()=>isPlaying() && !isLane() && [...pointers.values()].some(p=>p.kind==='dive'||(p.kind==='canvas'&&!p.lane))};
  }
  root.SkrumpeyTouchInput={create:createTouchInput};
  if(typeof module!=='undefined')module.exports=root.SkrumpeyTouchInput;
})(globalThis);
