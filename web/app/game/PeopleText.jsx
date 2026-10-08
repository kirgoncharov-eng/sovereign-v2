"use client";
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { nameParts, personProfiles } from '@/lib/client/people-text.ts';

const People = createContext(null);
const signed = v => v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0';

export function PeopleProvider({ gs, Portrait, children }) {
  const profiles = useMemo(()=>gs ? personProfiles(gs) : [],[gs]);
  const [active,setActive] = useState(null);
  const card = useRef(null), timer = useRef(null);
  const cardId = useId();
  const person = profiles.find(p=>p.id===active?.id);
  const close = () => {clearTimeout(timer.current);setActive(null);};
  const leave = () => {clearTimeout(timer.current);timer.current=setTimeout(()=>setActive(a=>a?.pinned?a:null),180);};
  useEffect(()=>{
    if(!active)return;
    const outside=e=>{if(!card.current?.contains(e.target)&&!active.anchor.contains(e.target))setActive(null);};
    const key=e=>{if(e.key==='Escape'){e.stopPropagation();active.anchor.focus();setActive(null);}};
    const scroll=e=>{if(!card.current?.contains(e.target))setActive(null);};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key,true);
    window.addEventListener('scroll',scroll,true);window.addEventListener('resize',scroll);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key,true);window.removeEventListener('scroll',scroll,true);window.removeEventListener('resize',scroll);};
  },[active]);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  const open=(p,anchor,pin=false)=>{
    clearTimeout(timer.current);
    setActive(a=>pin&&a?.id===p.id&&a.anchor===anchor&&a.pinned?null:{id:p.id,anchor,pinned:pin});
  };
  let position;
  if(person && active.anchor.isConnected){
    const rect=active.anchor.getBoundingClientRect(), width=Math.min(330,window.innerWidth-24);
    const below=window.innerHeight-rect.bottom;
    position={left:Math.max(12,Math.min(rect.left,window.innerWidth-width-12)),width, ...(below>=310 ? {top:rect.bottom+8,maxHeight:below-20} : {bottom:Math.max(12,window.innerHeight-rect.top+8),maxHeight:Math.max(130,rect.top-20)})};
  }
  return <People.Provider value={{profiles,open,leave,active,cardId}}>
    {children}
    {position && createPortal(<aside ref={card} id={cardId} role="dialog" aria-label={`Досье: ${person.name}`} className="sv-paper sv-person-card" style={position}
      onPointerEnter={()=>clearTimeout(timer.current)} onPointerLeave={leave}>
      <button className="sv-person-close" aria-label="Закрыть досье" onClick={close}>×</button>
      <div className="sv-person-heading">
        <Portrait name={person.name} size={42}/>
        <div><strong>{person.name}</strong><div>{person.role}</div></div>
      </div>
      {person.relation !== null && <div className="sv-person-relation" style={{color:person.relation>=30?'var(--grn)':person.relation<=-30?'var(--red)':'var(--amb)'}}>
        К вам: {signed(person.relation)} · {person.loyalty}
        <div className="sv-person-range"><span style={{width:`${(person.relation+100)/2}%`,background:'currentColor'}}/></div>
        <small>От −100 до +100</small>
      </div>}
      <dl>{person.rows.map((row,i)=><div key={i}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>
    </aside>,document.body)}
  </People.Provider>;
}

export function PeopleText({ children }) {
  const context=useContext(People);
  const text=String(children??'');
  const parts=useMemo(()=>context?nameParts(text,context.profiles):[{text}],[text,context]);
  return parts.map((part,i)=>part.person ? <button key={i} type="button" className="sv-person-name" aria-label={`Досье: ${part.person.name}`} aria-haspopup="dialog" aria-expanded={context.active?.id===part.person.id}
    aria-controls={context.active?.id===part.person.id?context.cardId:undefined}
    onPointerEnter={e=>{if(e.pointerType==='mouse')context.open(part.person,e.currentTarget);}}
    onPointerLeave={context.leave} onFocus={e=>context.open(part.person,e.currentTarget)}
    onClick={e=>{e.stopPropagation();context.open(part.person,e.currentTarget,true);}}
    onKeyDown={e=>{if(['Enter',' ','Escape'].includes(e.key))e.stopPropagation();}}
    >{part.text}</button>:part.text);
}
