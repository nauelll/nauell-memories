
const db = window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
);

const $ = id => document.getElementById(id);
let photos = [];
let currentSession = null;

function imageURL(path) {
  return db.storage.from('memories').getPublicUrl(path).data.publicUrl;
}

async function loadPhotos() {
  $('gallery').textContent = 'Memuat kenangan...';

  const { data, error } = await db.from('photos')
    .select('*')
    .order('taken_on', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) {
    $('gallery').textContent = 'Gagal memuat foto.';
    $('error').textContent = error.message;
    return;
  }

  photos = data || [];
  $('count').textContent = photos.length + ' kenangan tersimpan ❤️';
  $('gallery').innerHTML = '';

  if (!photos.length) {
    $('gallery').textContent = 'Belum ada foto. Kenangan pertama segera hadir ✨';
    return;
  }

  photos.forEach(p => {
    const card = document.createElement('div');
    card.className = 'photo';

    const img = document.createElement('img');
    img.src = imageURL(p.storage_path);
    img.alt = p.title || 'Kenangan';
    img.loading = 'lazy';

    const info = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = p.title || 'A memory';

    const date = document.createElement('p');
    date.textContent = p.taken_on || '';

    info.append(title, date);
    card.append(img, info);

    if (currentSession) {
      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:8px;padding:10px;';

      const editBtn = document.createElement('button');
      editBtn.textContent = '✏️ Edit';
      editBtn.type = 'button';

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '🗑️ Hapus';
      deleteBtn.type = 'button';

      editBtn.onclick = async e => {
        e.stopPropagation();

        const newTitle = prompt('Judul foto:', p.title || '');
        if (newTitle === null) return;

        const newCaption = prompt('Keterangan foto:', p.caption || '');
        if (newCaption === null) return;

        const newDate = prompt('Tanggal (YYYY-MM-DD):', p.taken_on || '');
        if (newDate === null) return;

        if (newDate && !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
          alert('Format tanggal harus YYYY-MM-DD.');
          return;
        }

        $('status').textContent = 'Menyimpan perubahan...';

        const { error } = await db.from('photos')
          .update({
            title: newTitle || 'A memory',
            caption: newCaption,
            taken_on: newDate || null
          })
          .eq('id', p.id);

        if (error) {
          $('status').textContent = error.message;
          return;
        }

        $('status').textContent = 'Foto berhasil diedit ❤️';
        await loadPhotos();
      };

      deleteBtn.onclick = async e => {
        e.stopPropagation();

        if (!confirm('Yakin ingin menghapus foto ini?')) return;

        $('status').textContent = 'Menghapus foto...';

        const { error } = await db.from('photos')
          .delete()
          .eq('id', p.id);

        if (error) {
          $('status').textContent = error.message;
          return;
        }

        const { error: storageError } = await db.storage
          .from('memories')
          .remove([p.storage_path]);

        if (storageError) {
          $('status').textContent =
            'Foto di galeri terhapus, tetapi file Storage gagal dihapus: ' +
            storageError.message;
        } else {
          $('status').textContent = 'Foto berhasil dihapus.';
        }

        await loadPhotos();
      };

      actions.append(editBtn, deleteBtn);
      card.append(actions);
    }

    card.onclick = () => {
      $('bigImage').src = img.src;
      $('bigTitle').textContent = p.title || 'A memory';
      $('bigCaption').textContent = p.caption || '';
      $('bigDate').textContent = p.taken_on || '';
      $('viewer').showModal();
    };

    $('gallery').append(card);
  });
}

$('refresh').onclick = loadPhotos;

$('adminOpen').onclick = async () => {
  $('admin').showModal();
  const { data } = await db.auth.getSession();
  showAdmin(data.session);
  await loadPhotos();
};

$('closeAdmin').onclick = () => $('admin').close();
$('closeViewer').onclick = () => $('viewer').close();

function showAdmin(session) {
  currentSession = session;
  $('loginForm').hidden = !!session;
  $('uploadPanel').hidden = !session;
  $('adminEmail').textContent = session ? 'Admin terverifikasi' : '';
  loadPhotos();
}

$('loginForm').onsubmit = async e => {
  e.preventDefault();
  $('status').textContent = 'Login...';

  const { data, error } = await db.auth.signInWithPassword({
    email: $('email').value,
    password: $('password').value
  });

  if (error) {
    $('status').textContent = error.message;
    return;
  }

  showAdmin(data.session);
  $('status').textContent = 'Login berhasil.';
};

$('logout').onclick = async () => {
  await db.auth.signOut();
  showAdmin(null);
};

$('uploadForm').onsubmit = async e => {
  e.preventDefault();

  const file = $('photo').files[0];
  if (!file) return;

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    $('status').textContent = 'Gunakan JPG, PNG, atau WEBP.';
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    $('status').textContent = 'Ukuran maksimal 10 MB.';
    return;
  }

  $('status').textContent = 'Mengunggah foto...';

  const ext = file.type === 'image/png' ? 'png' :
    file.type === 'image/webp' ? 'webp' : 'jpg';

  const path = Date.now() + '-' + crypto.randomUUID() + '.' + ext;

  const { error: upError } = await db.storage
    .from('memories')
    .upload(path, file, { contentType: file.type });

  if (upError) {
    $('status').textContent = upError.message;
    return;
  }

  const { error: dbError } = await db.from('photos').insert({
    title: $('title').value || 'A memory',
    caption: $('caption').value,
    taken_on: $('date').value || null,
    storage_path: path
  });

  if (dbError) {
    await db.storage.from('memories').remove([path]);
    $('status').textContent = dbError.message;
    return;
  }

  $('uploadForm').reset();
  $('status').textContent = 'Foto berhasil diunggah ❤️';
  await loadPhotos();
};

db.auth.onAuthStateChange((_event, session) => {
  showAdmin(session);
});

loadPhotos();


// ===== NOPAL & ELISA MUSIC SYSTEM =====

let currentMusic = null;

async function loadMusic() {
  const { data, error } = await db
    .from('site_music')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    console.error('Gagal memuat musik:', error.message);
    return;
  }

  currentMusic = data;

  if (!data) {
    $('musicBar').hidden = true;
    return;
  }

  const audio = $('musicAudio');
  const url = db.storage
    .from('memories')
    .getPublicUrl(data.storage_path).data.publicUrl;

  if (audio.dataset.path !== data.storage_path) {
    audio.pause();
    audio.src = url;
    audio.dataset.path = data.storage_path;
    audio.load();
  }

  $('musicTitle').textContent = data.title;
  $('musicBar').hidden = false;
}

$('musicToggle').onclick = async () => {
  const audio = $('musicAudio');

  if (!currentMusic) return;

  if (audio.paused) {
    try {
      await audio.play();
      $('musicToggle').textContent = 'Ⅱ';
    } catch (error) {
      $('musicStatus').textContent =
        'Tidak bisa memutar musik: ' + error.message;
    }
  } else {
    audio.pause();
    $('musicToggle').textContent = '▶';
  }
};

$('musicAudio').addEventListener('ended', () => {
  $('musicToggle').textContent = '▶';
});

$('musicAudio').addEventListener('pause', () => {
  $('musicToggle').textContent = '▶';
});

$('musicAudio').addEventListener('play', () => {
  $('musicToggle').textContent = 'Ⅱ';
});

$('musicForm').onsubmit = async e => {
  e.preventDefault();

  if (!currentSession) {
    $('musicStatus').textContent = 'Login admin terlebih dahulu.';
    return;
  }

  const file = $('musicFile').files[0];
  const title = $('musicName').value.trim();

  if (!file || !title) return;

  if (file.type !== 'audio/mpeg' &&
      !file.name.toLowerCase().endsWith('.mp3')) {
    $('musicStatus').textContent = 'Gunakan file MP3.';
    return;
  }

  if (file.size > 15 * 1024 * 1024) {
    $('musicStatus').textContent = 'Ukuran maksimal 15 MB.';
    return;
  }

  $('musicStatus').textContent = 'Mengunggah musik...';

  const oldPath = currentMusic?.storage_path || null;
  const path = 'music/' + Date.now() + '-' +
    crypto.randomUUID() + '.mp3';

  const { error: uploadError } = await db.storage
    .from('memories')
    .upload(path, file, {
      contentType: 'audio/mpeg'
    });

  if (uploadError) {
    $('musicStatus').textContent = uploadError.message;
    return;
  }

  const { error: saveError } = await db
    .from('site_music')
    .upsert({
      id: 1,
      title: title,
      storage_path: path,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });

  if (saveError) {
    await db.storage.from('memories').remove([path]);
    $('musicStatus').textContent = saveError.message;
    return;
  }

  await loadMusic();
  $('musicForm').reset();

  $('musicStatus').textContent = 'Musik berhasil diperbarui ❤️';

  if (oldPath) {
    const { error } = await db.storage
      .from('memories')
      .remove([oldPath]);

    if (error) {
      $('musicStatus').textContent +=
        ' File lagu lama belum terhapus dari Storage.';
    }
  }
};

$('deleteMusic').onclick = async () => {
  if (!currentSession || !currentMusic) return;

  if (!confirm('Yakin ingin menghapus musik?')) return;

  $('musicStatus').textContent = 'Menghapus musik...';

  const oldPath = currentMusic.storage_path;

  const { error } = await db
    .from('site_music')
    .delete()
    .eq('id', 1);

  if (error) {
    $('musicStatus').textContent = error.message;
    return;
  }

  $('musicAudio').pause();
  $('musicAudio').removeAttribute('src');
  $('musicAudio').dataset.path = '';

  const { error: storageError } = await db.storage
    .from('memories')
    .remove([oldPath]);

  await loadMusic();

  $('musicStatus').textContent = storageError
    ? 'Data musik terhapus, tetapi file Storage gagal dihapus.'
    : 'Musik berhasil dihapus.';
};

loadMusic();

// ===== END MUSIC SYSTEM =====
