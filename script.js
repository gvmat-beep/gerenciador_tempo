
// --- IMPORTAÇÕES DO FIREBASE ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
    getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider,
    signInAnonymously, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBSZTw_N6Gh1O7ACjHf4ASiqCu-SW1YAic",
    authDomain: "gerenciadortempo.firebaseapp.com",
    projectId: "gerenciadortempo",
    storageBucket: "gerenciadortempo.firebasestorage.app",
    messagingSenderId: "714344898496",
    appId: "1:714344898496:web:f2973516470ae244bef225"
};

// Inicialização Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

let currentUser = null;

//constantes
const canvas = document.getElementById('canvas');
const scrollArea = document.getElementById('scroll-area');
const minimap = document.getElementById('minimap');
const minimapViewport = document.getElementById('minimap-viewport');
const CANVAS_SIZE = 3000;
const MINIMAP_SIZE = 150;
const SCALE = MINIMAP_SIZE / CANVAS_SIZE;
const SNAP_DISTANCE = 20; // Distância do encaixe magnético
const pastelColors = ['#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF', '#E6B3FF'];

//variaveis
let blockCounter = 0;
let selectedBlock = null;
let copiedBlockData = null;

// --- SISTEMA DE SELEÇÃO E TECLADO ---
document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.time-block') && !e.target.closest('.sidebar')) {
        clearSelection();
    }
});

function clearSelection() {
    if (selectedBlock) selectedBlock.classList.remove('selected');
    selectedBlock = null;
}

function selectBlock(block) {
    clearSelection();
    selectedBlock = block;
    selectedBlock.classList.add('selected');
}

document.addEventListener('keydown', (e) => {
    if (e.target.tagName.toLowerCase() === 'input' || e.target.isContentEditable) return;

    // Deletar
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedBlock) {
        selectedBlock.remove();
        clearSelection();
        updateMinimap();
        saveState();
    }

    // Copiar (Ctrl+C)
    if (e.ctrlKey && e.key === 'c' && selectedBlock) {
        copiedBlockData = {
            bg: selectedBlock.style.backgroundColor,
            height: selectedBlock.style.height,
            title: selectedBlock.querySelector('.block-header span').innerText,
            duration: selectedBlock.querySelector('.block-duration').innerText,
            content: selectedBlock.querySelector('.block-body').innerText,
            colorVal: selectedBlock.querySelector('.color-picker').value
        };
    }

    // Colar (Ctrl+V)
    if (e.ctrlKey && e.key === 'v' && copiedBlockData) {
        const viewLeft = scrollArea.scrollLeft + (scrollArea.clientWidth / 2);
        const viewTop = scrollArea.scrollTop + (scrollArea.clientHeight / 2);
        createBlock(viewLeft, viewTop, copiedBlockData.bg, copiedBlockData.title, copiedBlockData.duration, copiedBlockData.content, copiedBlockData.colorVal, copiedBlockData.height);
        saveState();
    }
});

// --- DRAG AND DROP COM ENCAIXE MAGNÉTICO ---
let isDragging = false, currentBlock = null, offsetX = 0, offsetY = 0;

function makeDraggable(element) {
    element.addEventListener('mousedown', (e) => {
        if (e.target.tagName.toLowerCase() === 'input' || e.target.isContentEditable) return;
        selectBlock(element);
        isDragging = true; currentBlock = element;
        const rect = element.getBoundingClientRect();
        offsetX = e.clientX - rect.left; offsetY = e.clientY - rect.top;
    });
}

document.addEventListener('mousemove', (e) => {
    if (!isDragging || !currentBlock) return;

    const canvasRect = canvas.getBoundingClientRect();
    let x = e.clientX - canvasRect.left - offsetX;
    let y = e.clientY - canvasRect.top - offsetY;

    // Encaixe Magnético (Snapping)
    const blocks = document.querySelectorAll('.time-block');
    blocks.forEach(other => {
        if (other === currentBlock) return;
        const ox = parseFloat(other.style.left);
        const oy = parseFloat(other.style.top);
        const ow = other.offsetWidth;
        const oh = other.offsetHeight;

        // Encaixa Embaixo (Empilhar)
        if (Math.abs(y - (oy + oh)) < SNAP_DISTANCE && Math.abs(x - ox) < 50) { y = oy + oh; x = ox; }
        // Encaixa em Cima
        if (Math.abs((y + currentBlock.offsetHeight) - oy) < SNAP_DISTANCE && Math.abs(x - ox) < 50) { y = oy - currentBlock.offsetHeight; x = ox; }
        // Alinha as laterais (Esquerda)
        if (Math.abs(x - ox) < SNAP_DISTANCE) x = ox;
        // Encaixa do Lado Direito
        if (Math.abs(x - (ox + ow)) < SNAP_DISTANCE) x = ox + ow;
    });

    currentBlock.style.left = `${x}px`;
    currentBlock.style.top = `${y}px`;
    updateMinimap();
});

document.addEventListener('mouseup', () => {
    if (isDragging) saveState();
    isDragging = false;
    currentBlock = null;
});

// --- SISTEMA DE CRIAÇÃO E SALVAMENTO ---
function createBlock(left, top, bgColor, title = "Nova Tarefa", duration = "1h", content = "Detalhes...", colorVal = null, forcedHeight = null) {
    const newBlock = document.createElement('div');
    newBlock.className = 'time-block';
    newBlock.style.backgroundColor = bgColor;
    newBlock.style.left = `${left}px`;
    newBlock.style.top = `${top}px`;
    newBlock.id = `block-${blockCounter++}`;
    if (forcedHeight) newBlock.style.height = forcedHeight;

    const hexColor = colorVal || colorToHex(bgColor);

    newBlock.innerHTML = `
                <div class="block-header">
                    <span contenteditable="true" style="outline:none;">${title}</span>
                    <div>
                        <input type="color" class="color-picker" value="${hexColor}">
                        <span class="block-duration" contenteditable="true">${duration}</span>
                    </div>
                </div>
                <div class="block-body" contenteditable="true">${content}</span>
            `;

    // Eventos de edição para Salvar Automaticamente e Redimensionar
    const editableElements = newBlock.querySelectorAll('[contenteditable="true"]');
    editableElements.forEach(el => el.addEventListener('blur', () => {
        if (el.classList.contains('block-duration')) updateBlockHeight(newBlock);
        saveState();
    }));

    const colorPicker = newBlock.querySelector('.color-picker');
    colorPicker.addEventListener('input', (e) => {
        newBlock.style.backgroundColor = e.target.value;
        updateMinimap();
    });
    colorPicker.addEventListener('change', saveState);

    canvas.appendChild(newBlock);
    makeDraggable(newBlock);
    if (!forcedHeight) updateBlockHeight(newBlock);
    updateMinimap();
    return newBlock;
}

document.getElementById('btn-add-block').addEventListener('click', () => {
    const randomColor = pastelColors[blockCounter % pastelColors.length];
    const viewLeft = scrollArea.scrollLeft + (scrollArea.clientWidth / 2) - 90;
    const viewTop = scrollArea.scrollTop + (scrollArea.clientHeight / 2) - 50;
    createBlock(viewLeft, viewTop, randomColor);
    saveState();
});

// --- SISTEMA DE AUTENTICAÇÃO E UI ---
const btnProfile = document.getElementById('btn-profile');
const authModal = document.getElementById('auth-modal');
const saveStatus = document.getElementById('save-status');

// Toggle do Menu
btnProfile.addEventListener('click', () => authModal.classList.toggle('hidden'));

// Observador de Estado (Logado / Deslogado)
onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    const loggedOutSec = document.getElementById('logged-out-section');
    const loggedInSec = document.getElementById('logged-in-section');
    const profileImg = document.getElementById('profile-img');
    const profileIcon = document.getElementById('profile-icon');

    if (user) {
        // UI Logado
        loggedOutSec.classList.add('hidden');
        loggedInSec.classList.remove('hidden');
        document.getElementById('user-email').innerText = user.isAnonymous ? "Conta Anônima" : user.email;

        if (user.photoURL) {
            profileImg.src = user.photoURL;
            profileImg.style.display = 'block';
            profileIcon.style.display = 'none';
        }

        authModal.classList.add('hidden');
        await loadStateFromCloud(user.uid);
    } else {
        // UI Deslogado
        loggedOutSec.classList.remove('hidden');
        loggedInSec.classList.add('hidden');
        profileImg.style.display = 'none';
        profileIcon.style.display = 'block';

        loadStateFromLocal();
    }
});

// Ações de Login
document.getElementById('btn-google').addEventListener('click', () => signInWithPopup(auth, googleProvider));
document.getElementById('btn-anon').addEventListener('click', () => signInAnonymously(auth));
document.getElementById('btn-logout').addEventListener('click', () => { signOut(auth); authModal.classList.add('hidden'); });

document.getElementById('btn-login-email').addEventListener('click', () => {
    const email = document.getElementById('email-input').value;
    const pass = document.getElementById('password-input').value;
    signInWithEmailAndPassword(auth, email, pass).catch(e => alert("Erro: " + e.message));
});

document.getElementById('btn-signup-email').addEventListener('click', () => {
    const email = document.getElementById('email-input').value;
    const pass = document.getElementById('password-input').value;
    createUserWithEmailAndPassword(auth, email, pass).catch(e => alert("Erro: " + e.message));
});

// --- PERSISTÊNCIA (NUVEM E LOCAL) ---
function clearCanvas() {
    document.querySelectorAll('.time-block').forEach(b => b.remove());
    document.querySelectorAll('.mini-block').forEach(b => b.remove());
    blockCounter = 0;
}

function renderBlocksData(savedData) {
    if (savedData && savedData.length > 0) {
        savedData.forEach(data => createBlock(data.left, data.top, data.bg, data.title, data.duration, data.content, data.colorVal, data.height));
    } else {
        createBlock(CANVAS_SIZE / 2 - 90, CANVAS_SIZE / 2 - 50, pastelColors[0], "Bem-vindo!", "1h", "Mova, edite ou crie novos blocos!");
    }
    scrollArea.scrollLeft = (CANVAS_SIZE / 2) - (window.innerWidth / 2);
    scrollArea.scrollTop = (CANVAS_SIZE / 2) - (window.innerHeight / 2);
}

// Variável global para guardar o timer
let saveTimeout;

async function saveState() {
    // 1. Damos um feedback visual imediato para o usuário saber que algo está acontecendo
    saveStatus.innerHTML = "Salvando... ⏳";

    // 2. Cancelamos o salvamento anterior (se o usuário fez uma nova alteração antes do tempo acabar)
    clearTimeout(saveTimeout);

    // 3. Criamos um novo timer 
    saveTimeout = setTimeout(async () => {

        // --- A PARTIR DAQUI É O SEU CÓDIGO ORIGINAL DE SALVAR ---
        const blocksData = [];
        document.querySelectorAll('.time-block').forEach(b => {
            blocksData.push({
                left: parseFloat(b.style.left), top: parseFloat(b.style.top),
                height: b.style.height, bg: b.style.backgroundColor,
                title: b.querySelector('.block-header span').innerText,
                duration: b.querySelector('.block-duration').innerText,
                content: b.querySelector('.block-body').innerText,
                colorVal: b.querySelector('.color-picker').value
            });
        });

        if (currentUser) {
            // Salvar no Firebase
            setDoc(doc(db, "users", currentUser.uid), { cronograma: blocksData })
                .then(() => saveStatus.innerHTML = "Salvo na Nuvem ☁️")
                .catch(e => {
                    console.error("Erro ao salvar", e);
                    saveStatus.innerHTML = "Erro ao salvar ❌";
                });
        } else {
            // Salvar no LocalStorage
            localStorage.setItem('chronoCanvasData', JSON.stringify(blocksData));
            saveStatus.innerHTML = "Salvo no Navegador ✓";
        }

    }, 6000); // <-- Tempo de espera do Debounce (6000ms = 6s)
}

async function loadStateFromCloud(uid) {
    clearCanvas();
    saveStatus.innerHTML = "Carregando... ⏳";
    try {
        const docSnap = await getDoc(doc(db, "users", uid));
        if (docSnap.exists()) {
            renderBlocksData(docSnap.data().cronograma);
        } else {
            renderBlocksData([]); // Usuário novo
        }
        saveStatus.innerHTML = "Salvo na Nuvem ☁️";
    } catch (e) {
        console.error("Erro ao carregar dados", e);
    }
}

function loadStateFromLocal() {
    clearCanvas();
    const savedData = JSON.parse(localStorage.getItem('chronoCanvasData'));
    renderBlocksData(savedData);
    saveStatus.innerHTML = "Salvo no Navegador ✓";
}

// --- UTILIDADES ---
function updateBlockHeight(blockElement) {
    const durationText = blockElement.querySelector('.block-duration').innerText;
    let minutes = 0;
    const hoursMatch = durationText.match(/(\d+)\s*h/i);
    const minsMatch = durationText.match(/(\d+)\s*m/i);
    if (hoursMatch) minutes += parseInt(hoursMatch[1]) * 60;
    if (minsMatch) minutes += parseInt(minsMatch[1]);
    if (!hoursMatch && !minsMatch && !isNaN(parseInt(durationText))) minutes = parseInt(durationText);
    if (minutes === 0) minutes = 60;

    blockElement.style.height = `${Math.max(60, minutes * (100 / 60))}px`;
    updateMinimap();
}

function colorToHex(color) {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.fillStyle = color; return ctx.fillStyle;
}

// --- MINIMAPA ---
function updateMinimapViewport() {
    minimapViewport.style.width = `${scrollArea.clientWidth * SCALE}px`;
    minimapViewport.style.height = `${scrollArea.clientHeight * SCALE}px`;
    minimapViewport.style.left = `${scrollArea.scrollLeft * SCALE}px`;
    minimapViewport.style.top = `${scrollArea.scrollTop * SCALE}px`;
}
function updateMinimap() {
    document.querySelectorAll('.mini-block').forEach(el => el.remove());
    document.querySelectorAll('.time-block').forEach(block => {
        const mini = document.createElement('div');
        mini.className = 'mini-block';
        mini.style.left = `${parseFloat(block.style.left) * SCALE}px`;
        mini.style.top = `${parseFloat(block.style.top) * SCALE}px`;
        mini.style.width = `${block.offsetWidth * SCALE}px`;
        mini.style.height = `${block.offsetHeight * SCALE}px`;
        mini.style.backgroundColor = block.style.backgroundColor;
        minimap.appendChild(mini);
    });
}
scrollArea.addEventListener('scroll', updateMinimapViewport);
window.addEventListener('resize', updateMinimapViewport);

// --- EXPORTAR IMAGEM ---
document.getElementById('btn-export').addEventListener('click', () => {
    const originalBtnText = document.getElementById('btn-export').innerText;
    document.getElementById('btn-export').innerText = "⏳ Gerando...";

    // Ocultar elementos da interface que não queremos na foto
    clearSelection();

    // Tira foto apenas da área visível onde você está olhando no momento
    html2canvas(document.body, {
        x: 300, y: 0, // Ignora a barra lateral
        width: window.innerWidth - 300, height: window.innerHeight,
        backgroundColor: "#fcfcfc"
    }).then(canvasImage => {
        const link = document.createElement('a');
        link.download = 'Meu_Cronograma.png';
        link.href = canvasImage.toDataURL('image/png');
        link.click();
        document.getElementById('btn-export').innerText = originalBtnText;
    });
});

// --- GERAR CALENDÁRIO ---
const calGrid = document.getElementById('mini-calendar');
for (let i = 0; i < 0; i++) calGrid.appendChild(document.createElement('div'));
for (let i = 1; i <= 31; i++) {
    const day = document.createElement('div');
    day.className = 'cal-day';
    if (i === 7) day.classList.add('today');
    day.innerText = i;
    calGrid.appendChild(day);
}

// Iniciar
loadState();
updateMinimapViewport();