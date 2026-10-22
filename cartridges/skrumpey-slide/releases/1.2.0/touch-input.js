/* Pointer ownership keeps a second finger on Jump from cancelling Dive or swiping. */
(function(root){
  function createTouchInput({canvas,dive,jump,eventTarget,isPlaying,isLane,onJump,onLane,onActivate}){
    const pointers=new Map();
    const listen=(target,type,handler)=>target.addEventListener(type,handler);
    function begin(kind,e){
      if(!isPlaying() || (e.pointerType==='mouse' && e.button!==0))return;
      e.preventDefault();onActivate();
      const lane=isLane();
      pointers.set(e.pointerId,{kind,x:e.clientX,y:e.clientY,lane,moved:false});
      e.currentTarget.setPointerCapture?.(e.pointerId);
      if(kind==='jump')onJump();
    }
    listen(canvas,'pointerdown',e=>begin('canvas',e));
    listen(dive,'pointerdown',e=>begin('dive',e));
    listen(jump,'pointerdown',e=>begin('jump',e));
    listen(eventTarget,'pointermove',e=>{
      const p=pointers.get(e.pointerId);
      if(!p || p.kind!=='canvas' || p.moved)return;
      const dx=e.clientX-p.x,dy=e.clientY-p.y;
      if(Math.hypot(dx,dy)<28)return;
      p.moved=true;
      if(isPlaying() && p.lane && isLane() && Math.abs(dx)>Math.abs(dy))onLane(dx<0?4:8);
    });
    function end(e,cancelled){
      const p=pointers.get(e.pointerId);pointers.delete(e.pointerId);
      if(!p || cancelled || !isPlaying())return;
      // A runner tap becomes a hop only after release; swipes never hop.
      if(p.kind==='canvas' && p.lane && isLane() && !p.moved && Math.hypot(e.clientX-p.x,e.clientY-p.y)<28)onJump();
    }
    listen(eventTarget,'pointerup',e=>end(e,false));
    listen(eventTarget,'pointercancel',e=>end(e,true));
    listen(eventTarget,'lostpointercapture',e=>end(e,true));
    const reset=()=>pointers.clear();
    listen(eventTarget,'blur',reset);
    return {reset,isHeld:()=>isPlaying() && !isLane() && [...pointers.values()].some(p=>p.kind==='dive'||(p.kind==='canvas'&&!p.lane))};
  }
  root.SkrumpeyTouchInput={create:createTouchInput};
  if(typeof module!=='undefined')module.exports=root.SkrumpeyTouchInput;
})(globalThis);
