const cfg = window.NAUELL_CONFIG;
const db = window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY);
const $ = id => document.getElementById(id);
let photos = [];

function imageURL(path){
  return db.storage.from('memories').getPublicUrl(path).data.publicUrl;
}

async function loadPhotos(){
  $('gallery').textContent='Memuat kenangan...';
  const {data,error}=await db.from('photos')
    .select('*').order('taken_on',{ascending:false,nullsFirst:false})
    .order('created_at',{ascending:false});
  if(error){$('gallery').textContent='Gagal memuat foto.';$('error').textContent=error.message;return;}
  photos=data||[];
  $('count').textContent=photos.length+' kenangan tersimpan ❤️';
  $('gallery').innerHTML='';
  if(!photos.length){$('gallery').textContent='Belum ada foto. Kenangan pertama segera hadir ✨';return;}
  photos.forEach(p=>{
    const card=document.createElement('div');
    card.className='photo';
    const img=document.createElement('img');
    img.src=imageURL(p.storage_path);img.alt=p.title||'Kenangan';
    img.loading='lazy';
    const info=document.createElement('div');
    const title=document.createElement('h3');
    title.textContent=p.title||'A memory';
    const date=document.createElement('p');
    date.textContent=p.taken_on||'';
    info.append(title,date);card.append(img,info);
    card.onclick=()=>{
      $('bigImage').src=img.src;
      $('bigTitle').textContent=p.title||'A memory';
      $('bigCaption').textContent=p.caption||'';
      $('bigDate').textContent=p.taken_on||'';
      $('viewer').showModal();
    };
    $('gallery').append(card);
  });
}
$('refresh').onclick=loadPhotos;
$('adminOpen').onclick=async()=>{
  $('admin').showModal();
  const {data}=await db.auth.getSession();
  showAdmin(data.session);
};
$('closeAdmin').onclick=()=>$('admin').close();
$('closeViewer').onclick=()=>$('viewer').close();

function showAdmin(session){
  $('loginForm').hidden=!!session;
  $('uploadPanel').hidden=!session;
  $('adminEmail').textContent=session?.user?.email||'';
}
$('loginForm').onsubmit=async e=>{
  e.preventDefault();
  $('status').textContent='Login...';
  const {data,error}=await db.auth.signInWithPassword({
    email:$('email').value,password:$('password').value
  });
  if(error){$('status').textContent=error.message;return;}
  showAdmin(data.session);$('status').textContent='Login berhasil.';
};
$('logout').onclick=async()=>{
  await db.auth.signOut();showAdmin(null);
};
$('uploadForm').onsubmit=async e=>{
  e.preventDefault();
  const file=$('photo').files[0];
  if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)){
    $('status').textContent='Gunakan JPG, PNG, atau WEBP.';return;
  }
  if(file.size>10*1024*1024){
    $('status').textContent='Ukuran maksimal 10 MB.';return;
  }
  $('status').textContent='Mengunggah foto...';
  const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
  const path=Date.now()+'-'+crypto.randomUUID()+'.'+ext;
  const {error:upError}=await db.storage.from('memories').upload(path,file,{contentType:file.type});
  if(upError){$('status').textContent=upError.message;return;}
  const {error:dbError}=await db.from('photos').insert({
    title:$('title').value||'A memory',
    caption:$('caption').value,
    taken_on:$('date').value||null,
    storage_path:path
  });
  if(dbError){
    await db.storage.from('memories').remove([path]);
    $('status').textContent=dbError.message;return;
  }
  $('uploadForm').reset();
  $('status').textContent='Foto berhasil diunggah ❤️';
  await loadPhotos();
};
db.auth.onAuthStateChange((_event,session)=>showAdmin(session));
loadPhotos();
