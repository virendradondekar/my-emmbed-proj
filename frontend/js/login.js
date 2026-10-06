const form=document.getElementById('loginForm');
fetch('/api/auth/session').then(r=>r.json()).then(s=>{if(s.authenticated)location.replace('/');}).catch(()=>{});
form.addEventListener('submit',async event=>{
  event.preventDefault();
  const button=form.querySelector('button');button.disabled=true;button.textContent='Signing in…';
  const error=document.getElementById('error');error.textContent='';
  try{
    const response=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('email').value,password:document.getElementById('password').value})});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'Sign in failed.');
    location.replace('/');
  }catch(e){error.textContent=e.message;button.disabled=false;button.textContent='Sign in';}
});
