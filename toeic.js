let firebaseApp, auth, database;
let cloudSyncEnabled = false;
let userId = null;
let userEmail = null;
let backupList = [];
let selectedBackupKey = null;
let selectedBackupItem = null;
let dailyChart = null;
let isRegisterMode = false;
let isPasswordResetMode = false;
let isSwitchAccountMode = false;
let pendingAction = null;
let currentSyncStatus = "已登录并连接云端";

// 日期工具函数
function getSafeDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplayTime(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleString('zh-CN');
}

// 生成智能备份名称
function generateSmartBackupName() {
  const totalWords = words.length;
  const unmastered = words.filter(x => !mastered[x]).length;
  const favCount = favorites.filter(x => !mastered[x]).length;
  const wrongCount = wrongWords.filter(x => !mastered[x]).length;
  
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  
  return `单词${totalWords}个_未学${unmastered}个_收藏${favCount}个_错题${wrongCount}个_${year}-${month}-${day}_${hour}-${min}`;
}

// 主题切换
function toggleTheme() {
  const b = document.body;
  const t = document.getElementById("themeToggle");
  b.classList.toggle("dark-theme");
  if (b.classList.contains("dark-theme")) {
    t.textContent = "☀️";
    localStorage.setItem("theme", "dark");
  } else {
    t.textContent = "🌙";
    localStorage.setItem("theme", "light");
  }
  updateChartTheme();
}

function initTheme() {
  const s = localStorage.getItem("theme");
  const t = document.getElementById("themeToggle");
  if (s === "dark") {
    document.body.classList.add("dark-theme");
    t.textContent = "☀️";
  } else {
    document.body.classList.remove("dark-theme");
    t.textContent = "🌙";
  }
}

function updateChartTheme() {
  if (!dailyChart) return;
  const d = document.body.classList.contains("dark-theme");
  dailyChart.options.scales.y.grid.color = d ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)";
  dailyChart.options.scales.y.ticks.color = d ? "#a1a1aa" : "#64748b";
  dailyChart.options.scales.x.ticks.color = d ? "#a1a1aa" : "#64748b";
  dailyChart.update();
}

function updateSyncStatus(status, text) {
  const map = {
    syncing: "正在同步...",
    synced: "已登录并连接云端",
    error: "云端连接失败",
    local: "本地模式"
  };
  currentSyncStatus = text || map[status] || "正在连接云端...";
  
  const statusEl = document.getElementById("avatarUserStatus");
  if (statusEl) {
    statusEl.textContent = currentSyncStatus;
    if (status === "synced") {
      statusEl.style.color = "var(--success)";
    } else if (status === "error") {
      statusEl.style.color = "var(--danger)";
    } else if (status === "syncing") {
      statusEl.style.color = "var(--warning)";
    } else {
      statusEl.style.color = "var(--text-secondary)";
    }
  }
}

function updateAvatarMenu() {
  const avatarDropdown = document.getElementById("avatarDropdown");
  const recordManagerBtn = document.getElementById("recordManagerBtn");
  const avatarUserEmail = document.getElementById("avatarUserEmail");
  
  if (userId && userEmail) {
    avatarDropdown.style.display = "block";
    recordManagerBtn.style.display = "block";
    avatarUserEmail.textContent = userEmail;
    updateSyncStatus("synced");
  } else {
    avatarDropdown.style.display = "none";
    recordManagerBtn.style.display = "none";
  }
}

function toggleAvatarMenu() {
  const dropdown = document.getElementById("avatarDropdown");
  dropdown.classList.toggle("active");
}

document.addEventListener("click", function(e) {
  const dropdown = document.getElementById("avatarDropdown");
  if (!dropdown.contains(e.target)) {
    dropdown.classList.remove("active");
  }
});

function updateBackupActionButtons() {
  const buttons = document.querySelectorAll('.backup-action-btn');
  buttons.forEach(btn => {
    btn.disabled = !selectedBackupKey;
  });
  const confirmBtn = document.getElementById("selectBackupConfirmBtn");
  if (confirmBtn) {
    confirmBtn.disabled = !selectedBackupKey;
  }
}

// Firebase 初始化
if (window.location.protocol !== 'file:') {
  try {
    firebaseApp = firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    database = firebase.database();
    cloudSyncEnabled = true;
    
    auth.onAuthStateChanged(user => {
      if (user) {
        userId = user.uid;
        userEmail = user.email;
        updateAvatarMenu();
        document.getElementById("mainContent").classList.add("visible");
        closeModal("loginModal");
        
        // 已登录 不再自动弹出选择记录弹窗
      } else {
        userId = null;
        userEmail = null;
        updateAvatarMenu();
        updateSyncStatus("local");
        document.getElementById("mainContent").classList.remove("visible");
        showLoginModal(false);
      }
    });
  } catch (e) {
    console.error("Firebase初始化失败", e);
    cloudSyncEnabled = false;
    updateSyncStatus("error", "云端连接失败，本地模式");
  }
}

function showLoginModal(isSwitchAccount = false) {
  isRegisterMode = false;
  isPasswordResetMode = false;
  isSwitchAccountMode = isSwitchAccount;
  
  document.getElementById("loginSubmitBtn").textContent = "登录";
  document.getElementById("passwordGroup").style.display = "block";
  document.getElementById("passwordInput").required = true;
  document.getElementById("loginFormSwitch").innerHTML = '没有账号？<a onclick="switchToRegister()">立即注册</a>';
  document.getElementById("emailInput").value = "";
  document.getElementById("passwordInput").value = "";
  
  const closeBtn = document.getElementById("loginModalClose");
  closeBtn.style.display = isSwitchAccount ? "flex" : "none";
  
  showModal("loginModal");
}

function switchToRegister() {
  isRegisterMode = true;
  isPasswordResetMode = false;
  document.getElementById("loginModalTitle").textContent = "欢迎使用YIMOO单词学习版，请注册账号~";
  document.getElementById("loginSubmitBtn").textContent = "注册";
  document.getElementById("passwordGroup").style.display = "block";
  document.getElementById("passwordInput").required = true;
  document.getElementById("loginFormSwitch").innerHTML = '已有账号？<a onclick="switchToLogin()">立即登录</a>';
}

function switchToLogin() {
  isRegisterMode = false;
  isPasswordResetMode = false;
  document.getElementById("loginModalTitle").textContent = "欢迎使用YIMOO单词学习版，请登录账号~";
  document.getElementById("loginSubmitBtn").textContent = "登录";
  document.getElementById("passwordGroup").style.display = "block";
  document.getElementById("passwordInput").required = true;
  document.getElementById("loginFormSwitch").innerHTML = '没有账号？<a onclick="switchToRegister()">立即注册</a>';
}

function showPasswordResetForm() {
  isPasswordResetMode = true;
  isRegisterMode = false;
  document.getElementById("loginModalTitle").textContent = "重置密码";
  document.getElementById("loginSubmitBtn").textContent = "发送重置链接";
  document.getElementById("passwordGroup").style.display = "none";
  document.getElementById("passwordInput").required = false;
  document.getElementById("loginFormSwitch").innerHTML = '记得密码？<a onclick="switchToLogin()">返回登录</a>';
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const email = document.getElementById("emailInput").value.trim();
  const password = document.getElementById("passwordInput").value;
  const submitBtn = document.getElementById("loginSubmitBtn");
  
  submitBtn.disabled = true;
  
  try {
    if (isPasswordResetMode) {
      submitBtn.textContent = "发送中...";
      await auth.sendPasswordResetEmail(email);
      showAutoImportStatus("✅ 密码重置链接已发送到您的邮箱", "success");
      switchToLogin();
    } else if (isRegisterMode) {
      submitBtn.textContent = "注册中...";
      await auth.createUserWithEmailAndPassword(email, password);
      showAutoImportStatus("✅ 账号注册成功，已自动登录", "success");
    } else {
      submitBtn.textContent = "登录中...";
      await auth.signInWithEmailAndPassword(email, password);
      showAutoImportStatus("✅ 登录成功", "success");
    }
  } catch (error) {
    let errorMessage = "操作失败";
    switch (error.code) {
      case "auth/email-already-in-use":
        errorMessage = "该邮箱已被注册，请直接登录";
        break;
      case "auth/invalid-email":
        errorMessage = "邮箱格式不正确";
        break;
      case "auth/user-not-found":
        errorMessage = "该账号不存在，请先注册";
        break;
      case "auth/wrong-password":
        errorMessage = "密码错误";
        break;
      case "auth/weak-password":
        errorMessage = "密码太弱，至少需要6位";
        break;
      case "auth/network-request-failed":
        errorMessage = "网络错误，请检查网络连接";
        break;
      case "auth/user-disabled":
        errorMessage = "该账号已被禁用";
        break;
      case "auth/too-many-requests":
        errorMessage = "操作过于频繁，请稍后再试";
        break;
    }
    showAutoImportStatus("❌ " + errorMessage, "error");
    submitBtn.disabled = false;
    submitBtn.textContent = isPasswordResetMode ? "发送重置链接" : (isRegisterMode ? "注册" : "登录");
  }
}

async function signOut() {
  if (!confirm("确定要登出吗？登出后将无法使用云端功能。")) return;
  try {
    await auth.signOut();
    localStorage.clear();
    location.reload();
  } catch (error) {
    showAutoImportStatus("❌ 登出失败：" + error.message, "error");
  }
}

async function showSelectBackupModal() {
  const el = document.getElementById("selectBackupList");
  el.innerHTML = '<div class="empty">正在加载学习记录...</div>';
  selectedBackupKey = null;
  updateBackupActionButtons();
  showModal("selectBackupModal");
  
  try {
    const snap = await database.ref(`users/${userId}/backups`).orderByChild("timestamp").once("value");
    const d = snap.val() || {};
    backupList = [];
    for (let k in d) backupList.push({ key: k, ...d[k] });
    backupList.sort((a, b) => b.timestamp - a.timestamp);
    
    if (backupList.length === 0) {
      el.innerHTML = '<div class="empty">暂无学习记录，请导入新的单词库开始学习</div>';
      document.getElementById("selectBackupConfirmBtn").style.display = "none";
    } else {
      document.getElementById("selectBackupConfirmBtn").style.display = "block";
      renderSelectBackupList();
    }
  } catch (e) {
    el.innerHTML = '<div class="empty">加载学习记录失败</div>';
  }
}

function renderSelectBackupList() {
  const el = document.getElementById("selectBackupList");
  let html = "";
  backupList.forEach(item => {
    const isSelected = item.key === selectedBackupKey;
    html += `<div class="backup-item ${isSelected ? 'selected' : ''}" onclick="selectBackupForStudy('${item.key}')">
      <div class="backup-info">
        <div class="backup-name">${item.backupName}</div>
        <div class="backup-time">最后更新：${formatDisplayTime(item.timestamp)}</div>
      </div>
    </div>`;
  });
  el.innerHTML = html;
}

function selectBackupForStudy(key) {
  selectedBackupKey = key;
  selectedBackupItem = backupList.find(x => x.key === key);
  updateBackupActionButtons();
  renderSelectBackupList();
}

function confirmSelectBackup() {
  if (!selectedBackupKey || !selectedBackupItem) {
    alert("请先选择一个学习记录");
    return;
  }
  
  wordDatabase = selectedBackupItem.wordDatabase || {};
  words = Object.keys(wordDatabase);
  mastered = selectedBackupItem.mastered || {};
  favorites = selectedBackupItem.favorites || [];
  wrongWords = selectedBackupItem.wrongWords || [];
  dailyData = selectedBackupItem.dailyData || {};
  
  if (!dailyData[todayKey]) dailyData[todayKey] = 0;
  saveData(false);
  switchToList('unmastered');
  updateUI();
  closeModal("selectBackupModal");
  showAutoImportStatus("✅ 已加载学习记录", "success");
}

function showImportFromSelectModal() {
  closeModal("selectBackupModal");
  showImportModal();
}

function showImportModal() {
  showModal("importModal");
  setupImportDragAndDrop();
}

function setupImportDragAndDrop() {
  const z = document.getElementById("importDropZone");
  if (!z) return;
  ["dragenter", "dragover", "dragleave", "drop"].forEach(n => z.addEventListener(n, e => e.preventDefault()));
  ["dragenter", "dragover"].forEach(n => z.addEventListener(n, () => z.classList.add("active")));
  ["dragleave", "drop"].forEach(n => z.addEventListener(n, () => z.classList.remove("active")));
  z.addEventListener("drop", e => {
    if (isImporting) return;
    const f = e.dataTransfer.files;
    if (f.length > 0 && f[0].name.endsWith(".csv")) readFile(f[0]);
    else alert("请拖放CSV文件");
  });
}

async function showRecordManagerModal() {
  const el = document.getElementById("recordManagerBackupList");
  el.innerHTML = '<div class="empty">正在加载学习记录...</div>';
  selectedBackupKey = null;
  updateBackupActionButtons();
  showModal("recordManagerModal");
  
  try {
    const snap = await database.ref(`users/${userId}/backups`).orderByChild("timestamp").once("value");
    const d = snap.val() || {};
    backupList = [];
    for (let k in d) backupList.push({ key: k, ...d[k] });
    backupList.sort((a, b) => b.timestamp - a.timestamp);
    renderRecordManagerBackupList();
  } catch (e) {
    el.innerHTML = '<div class="empty">加载学习记录失败</div>';
  }
}

function renderRecordManagerBackupList() {
  const el = document.getElementById("recordManagerBackupList");
  if (backupList.length === 0) {
    el.innerHTML = '<div class="empty">暂无学习记录</div>';
    return;
  }
  let html = "";
  backupList.forEach(item => {
    const isSelected = item.key === selectedBackupKey;
    html += `<div class="backup-item ${isSelected ? 'selected' : ''}" onclick="selectBackup('${item.key}')">
      <input type="checkbox" class="backup-checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); selectBackup('${item.key}')">
      <div class="backup-info">
        <div class="backup-name">${item.backupName}</div>
        <div class="backup-time">最后更新：${formatDisplayTime(item.timestamp)}</div>
      </div>
    </div>`;
  });
  el.innerHTML = html;
}

function selectBackup(key) {
  if (selectedBackupKey === key) {
    selectedBackupKey = null;
  } else {
    selectedBackupKey = key;
  }
  updateBackupActionButtons();
  renderRecordManagerBackupList();
}

function exportSelectedBackup() {
  if (!selectedBackupKey) {
    alert("请先选择一个记录");
    return;
  }
  const item = backupList.find(x => x.key === selectedBackupKey);
  if (!item || !item.wordDatabase) {
    alert("该记录没有单词库数据");
    return;
  }
  
  let csv = "No,words,transliteration,chinese,example sentence\n";
  let n = 1;
  for (let w in item.wordDatabase) {
    const info = item.wordDatabase[w];
    csv += `${n},${w},${info.transliteration},${info.chinese},${info.example}\n`;
    n++;
  }
  const b = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const u = URL.createObjectURL(b);
  const a = document.createElement("a");
  a.href = u; a.download = `${item.backupName}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  showAutoImportStatus("✅ 单词库已导出", "success");
}

function restoreSelectedBackup() {
  if (!selectedBackupKey) {
    alert("请先选择一个记录");
    return;
  }
  if (!confirm("确定恢复此记录？将覆盖当前单词库+所有学习进度！")) return;
  
  const item = backupList.find(x => x.key === selectedBackupKey);
  if (!item) return;
  
  wordDatabase = item.wordDatabase || {};
  words = Object.keys(wordDatabase);
  mastered = item.mastered || {};
  favorites = item.favorites || [];
  wrongWords = item.wrongWords || [];
  dailyData = item.dailyData || {};
  
  if (!dailyData[todayKey]) dailyData[todayKey] = 0;
  saveData(false);
  switchToList(currentList);
  updateUI();
  closeModal("recordManagerModal");
  showAutoImportStatus("✅ 已恢复学习记录", "success");
}

function deleteSelectedBackup() {
  if (!selectedBackupKey) {
    alert("请先选择一个记录");
    return;
  }
  pendingAction = () => {
    try {
      database.ref(`users/${userId}/backups/${selectedBackupKey}`).remove();
      backupList = backupList.filter(x => x.key !== selectedBackupKey);
      selectedBackupKey = null;
      if (backupList.length === 0) {
        restoreDefaultWordDatabase();
      }
      showAutoImportStatus("✅ 记录已删除", "success");
      showRecordManagerModal();
    } catch (e) {
      alert("删除失败：" + e.message);
    }
  };
  document.getElementById("passwordVerifyTitle").textContent = "删除记录验证";
  showModal("passwordVerifyModal");
}

function restoreDefaultWordDatabase() {
  wordDatabase = {
    bill: { transliteration: "/bɪl/", chinese: "账单；法案", example: "Please pay the bill before leaving." },
    charge: { transliteration: "/tʃɑːrdʒ/", chinese: "收费；充电；指控", example: "The company will charge extra for delivery." },
    strategy: { transliteration: "/ˈstrætədʒi/", chinese: "策略；战略", example: "We need a better strategy." },
    comply: { transliteration: "/kəmˈplaɪ/", chinese: "遵守", example: "All must comply with rules." },
    negotiate: { transliteration: "/nɪˈɡəʊʃieɪt/", chinese: "谈判；协商", example: "They negotiated a discount." }
  };
  words = Object.keys(wordDatabase);
  mastered = {};
  favorites = [];
  wrongWords = [];
  dailyData = {};
  dailyData[todayKey] = 0;
  
  saveData(false);
  switchToList('unmastered');
  updateUI();
}

async function syncFromSelectedBackup() {
  if (!selectedBackupKey) {
    alert("请先选择一个记录");
    return;
  }
  if (!confirm("确定将当前进度保存到选中记录？将覆盖该记录的所有数据！")) return;
  
  try {
    const ts = Date.now();
    const newBackupName = generateSmartBackupName();
    
    const data = {
      backupName: newBackupName,
      timestamp: ts,
      wordDatabase: JSON.parse(JSON.stringify(wordDatabase)),
      mastered: JSON.parse(JSON.stringify(mastered)),
      favorites: JSON.parse(JSON.stringify(favorites)),
      wrongWords: JSON.parse(JSON.stringify(wrongWords)),
      dailyData: JSON.parse(JSON.stringify(dailyData))
    };
    
    await database.ref(`users/${userId}/backups/${selectedBackupKey}`).set(data);
    showAutoImportStatus("✅ 已将当前进度保存到选中记录", "success");
    showRecordManagerModal();
  } catch (e) {
    alert("保存失败：" + e.message);
  }
}

function resetFromSelectedBackup() {
  if (!selectedBackupKey) {
    alert("请先选择一个记录");
    return;
  }
  pendingAction = () => {
    mastered = {};
    favorites = [];
    wrongWords = [];
    dailyData = {};
    dailyData[todayKey] = 0;
    
    const ts = Date.now();
    const newBackupName = generateSmartBackupName();
    
    const data = {
      backupName: newBackupName,
      timestamp: ts,
      wordDatabase: JSON.parse(JSON.stringify(wordDatabase)),
      mastered: {},
      favorites: [],
      wrongWords: [],
      dailyData: { [todayKey]: 0 }
    };
    
    database.ref(`users/${userId}/backups/${selectedBackupKey}`).set(data)
      .then(() => {
        saveData(true);
        switchToList(currentList);
        updateUI();
        closeModal("recordManagerModal");
        showAutoImportStatus("✅ 学习进度已重置", "success");
      })
      .catch(e => {
        alert("重置失败：" + e.message);
      });
  };
  document.getElementById("passwordVerifyTitle").textContent = "重置进度验证";
  showModal("passwordVerifyModal");
}

async function handlePasswordVerify(event) {
  event.preventDefault();
  const password = document.getElementById("verifyPasswordInput").value;
  const submitBtn = document.getElementById("verifySubmitBtn");
  
  submitBtn.disabled = true;
  submitBtn.textContent = "验证中...";
  
  try {
    const user = auth.currentUser;
    const credential = firebase.auth.EmailAuthProvider.credential(user.email, password);
    await user.reauthenticateWithCredential(credential);
    
    closeModal("passwordVerifyModal");
    document.getElementById("verifyPasswordInput").value = "";
    if (pendingAction) {
      pendingAction();
      pendingAction = null;
    }
  } catch (error) {
    let errorMessage = "密码错误";
    if (error.code === "auth/wrong-password") {
      errorMessage = "密码错误，请重新输入";
    } else if (error.code === "auth/network-request-failed") {
      errorMessage = "网络错误，请检查网络连接";
    }
    showAutoImportStatus("❌ " + errorMessage, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "确认";
  }
}

async function createNewBackup(name = "") {
  if (!cloudSyncEnabled || !userId) { alert("请先登录账号"); return; }
  const bn = name || generateSmartBackupName();
  const ts = Date.now();
  const data = {
    backupName: bn,
    timestamp: ts,
    wordDatabase: JSON.parse(JSON.stringify(wordDatabase)),
    mastered: JSON.parse(JSON.stringify(mastered)),
    favorites: JSON.parse(JSON.stringify(favorites)),
    wrongWords: JSON.parse(JSON.stringify(wrongWords)),
    dailyData: JSON.parse(JSON.stringify(dailyData))
  };
  try {
    await database.ref(`users/${userId}/backups`).push(data);
    showAutoImportStatus("✅ 学习记录已保存", "success");
  } catch (e) { alert("保存失败：" + e.message); }
}

function showRenameBackupModal() {
  if (!selectedBackupKey) {
    alert("请先选择一个记录");
    return;
  }
  const item = backupList.find(x => x.key === selectedBackupKey);
  if (!item) return;
  
  document.getElementById("renameBackupInput").value = item.backupName;
  showModal("renameBackupModal");
}

async function handleRenameBackup(event) {
  event.preventDefault();
  const newName = document.getElementById("renameBackupInput").value.trim();
  const submitBtn = document.getElementById("renameBackupSubmitBtn");
  
  if (!newName) {
    alert("请输入新名称");
    return;
  }
  
  submitBtn.disabled = true;
  submitBtn.textContent = "保存中...";
  
  try {
    await database.ref(`users/${userId}/backups/${selectedBackupKey}/backupName`).set(newName);
    showAutoImportStatus("✅ 记录重命名成功", "success");
    closeModal("renameBackupModal");
    showRecordManagerModal();
  } catch (e) {
    alert("重命名失败：" + e.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "确定";
  }
}

// 单词核心数据
let wordDatabase = JSON.parse(localStorage.getItem("wordDatabase") || "{}");
let words = Object.keys(wordDatabase).length > 0 ? Object.keys(wordDatabase) : ["bill", "charge", "strategy", "comply", "negotiate"];
const defaultWordInfo = {
  bill: { transliteration: "/bɪl/", chinese: "账单；法案", example: "Please pay the bill before leaving." },
  charge: { transliteration: "/tʃɑːrdʒ/", chinese: "收费；充电；指控", example: "The company will charge extra for delivery." },
  strategy: { transliteration: "/ˈstrætədʒi/", chinese: "策略；战略", example: "We need a better strategy." },
  comply: { transliteration: "/kəmˈplaɪ/", chinese: "遵守", example: "All must comply with rules." },
  negotiate: { transliteration: "/nɪˈɡəʊʃieɪt/", chinese: "谈判；协商", example: "They negotiated a discount." }
};
wordDatabase = Object.assign({}, defaultWordInfo, wordDatabase);

let currentList = "unmastered", deck = [], index = 0, reveal = false, autoPlay = false, timer = null;
let autoPlayInterval = 4000, isImporting = false;
let favorites = JSON.parse(localStorage.getItem("favorites") || "[]");
let wrongWords = JSON.parse(localStorage.getItem("wrongWords") || "[]");
let mastered = JSON.parse(localStorage.getItem("mastered") || "{}");
let dailyData = JSON.parse(localStorage.getItem("dailyData") || "{}");

const todayKey = getSafeDateKey();
if (!dailyData[todayKey]) dailyData[todayKey] = 0;

function saveData(sync = true) {
  localStorage.setItem("wordDatabase", JSON.stringify(wordDatabase));
  localStorage.setItem("favorites", JSON.stringify(favorites));
  localStorage.setItem("wrongWords", JSON.stringify(wrongWords));
  localStorage.setItem("mastered", JSON.stringify(mastered));
  localStorage.setItem("dailyData", JSON.stringify(dailyData));
  localStorage.setItem("lastSync", Date.now().toString());
}

function toggleReveal() {
  reveal = !reveal;
  updateUI();
}

function speakWord(e) {
  if (e) e.stopPropagation();
  const w = currentWord();
  if (w === "该列表暂无未学单词" || w === "无匹配结果") return;
  if (!("speechSynthesis" in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(w);
    u.lang = "en-US";
    u.rate = 0.9;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch (err) { }
}

function currentWord() { return deck[index] || ""; }

function updateUI() {
  const w = currentWord();
  document.getElementById("word").innerText = w;
  document.getElementById("indexText").innerText = `${index + 1} / ${deck.length}`;
  const info = wordDatabase[w] || { transliteration: "暂无音标", chinese: "暂无释义", example: "No example" };
  document.getElementById("transliteration").innerText = info.transliteration;
  document.getElementById("chinese").innerText = info.chinese;
  document.getElementById("example").innerText = info.example;
  document.getElementById("details").style.display = reveal ? "block" : "none";

  const un = words.filter(x => !mastered[x]).length;
  const fav = favorites.filter(x => !mastered[x]).length;
  const wr = wrongWords.filter(x => !mastered[x]).length;
  document.getElementById("unmasteredCount").innerText = un;
  document.getElementById("favoriteCount").innerText = fav;
  document.getElementById("wrongCount").innerText = wr;
  document.getElementById("dailyCount").innerText = dailyData[todayKey];
  const prog = Math.round(Object.keys(mastered).length / words.length * 100);
  document.getElementById("progressText").innerText = `${prog}%`;
  document.getElementById("progress").style.width = `${prog}%`;
  saveData(false);
}

function switchToList(type) {
  if (autoPlay) toggleAutoPlay();
  currentList = type;
  index = 0;
  reveal = false;
  switch (type) {
    case "unmastered":
      deck = words.filter(w => !mastered[w]);
      document.getElementById("currentListTitle").textContent = "📚 未学单词";
      document.getElementById("returnBtn").style.display = "none";
      break;
    case "favorites":
      deck = favorites.filter(w => !mastered[w]);
      document.getElementById("currentListTitle").textContent = "⭐ 收藏单词";
      document.getElementById("returnBtn").style.display = "inline-flex";
      break;
    case "wrongWords":
      deck = wrongWords.filter(w => !mastered[w]);
      document.getElementById("currentListTitle").textContent = "❌ 错题单词";
      document.getElementById("returnBtn").style.display = "inline-flex";
      break;
  }
  if (deck.length === 0) deck = ["该列表暂无未学单词"];
  updateUI();
}

function prevWord(e) {
  if (e) e.stopPropagation();
  reveal = false;
  index = (index - 1 + deck.length) % deck.length;
  updateUI();
  setTimeout(speakWord, 100);
}

function nextWord(e) {
  if (e) e.stopPropagation();
  reveal = false;
  index = (index + 1) % deck.length;
  updateUI();
  setTimeout(speakWord, 100);
}

function markKnown() {
  const w = currentWord();
  if (w === "该列表暂无未学单词") return;
  mastered[w] = true;
  dailyData[todayKey]++;
  deck.splice(index, 1);
  if (deck.length === 0) deck = ["该列表暂无未学单词"], index = 0;
  else index = index % deck.length;
  updateUI();
  setTimeout(speakWord, 100);
}

function markUnknown() {
  const w = currentWord();
  if (w === "该列表暂无未学单词") return;
  if (!wrongWords.includes(w)) wrongWords.unshift(w);
  dailyData[todayKey]++;
  nextWord();
}

function toggleFavorite() {
  const w = currentWord();
  if (w === "该列表暂无未学单词") return;
  favorites.includes(w)
    ? favorites = favorites.filter(x => x !== w)
    : favorites.unshift(w);
  updateUI();
}

function shuffleWords() {
  if (deck.length <= 1 || deck[0] === "该列表暂无未学单词") return;
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  index = 0;
  updateUI();
  setTimeout(speakWord, 100);
}

function toggleAutoPlay() {
  if (deck[0] === "该列表暂无未学单词") {
    alert("当前列表暂无单词可播放");
    return;
  }
  autoPlay = !autoPlay;
  const btn = document.getElementById("autoBtn");
  if (autoPlay) {
    btn.innerText = "⏸️ 暂停";
    setTimeout(speakWord, 100);
    timer = setInterval(nextWord, autoPlayInterval);
  } else {
    btn.innerText = "▶️ 播放";
    clearInterval(timer);
  }
}

function updateInterval() {
  const inp = document.getElementById("intervalInput");
  const v = parseFloat(inp.value);
  if (isNaN(v) || v < 1 || v > 30) {
    alert("请输入1-30之间数字");
    inp.value = autoPlayInterval / 1000;
    return;
  }
  autoPlayInterval = v * 1000;
  if (autoPlay) {
    clearInterval(timer);
    timer = setInterval(nextWord, autoPlayInterval);
  }
  alert(`已设置为 ${v} 秒`);
}

function parseCSV(t) {
  const l = t.split("\n").filter(x => x.trim());
  const res = {};
  if (l.length === 0) return res;
  for (let i = 1; i < l.length; i++) {
    let curr = "", inq = false, parts = [];
    for (let c of l[i]) {
      if (c === '"') inq = !inq;
      else if (c === "," && !inq) {
        parts.push(curr.trim());
        curr = "";
      } else curr += c;
    }
    parts.push(curr.trim());
    if (parts.length >= 2 && parts[1]) {
      const w = parts[1];
      res[w] = {
        transliteration: parts[2] || "暂无音标",
        chinese: parts[3] || "暂无释义",
        example: parts[4] || "No example"
      };
    }
  }
  return res;
}

function importFromFileContent(content, fileName) {
  try {
    const p = parseCSV(content);
    if (Object.keys(p).length === 0) { alert("CSV为空或格式错误"); return false; }
    wordDatabase = p;
    words = Object.keys(p);
    mastered = {};
    favorites = [];
    wrongWords = [];
    dailyData = {};
    dailyData[todayKey] = 0;
    
    createNewBackup();
    
    switchToList("unmastered");
    closeModal("importModal");
    showAutoImportStatus(`✅ 导入 ${words.length} 个单词，已创建新的学习记录`, "success");
    return true;
  } catch (e) { alert("CSV解析失败"); return false; }
}

function importCSV(e) {
  if (isImporting) return;
  const f = e.target.files[0]; if (!f) return;
  e.target.value = ""; readFile(f);
}

function readFile(f) {
  if (isImporting) return;
  isImporting = true;
  const r = new FileReader();
  r.onload = ev => {
    importFromFileContent(ev.target.result, f.name);
    isImporting = false;
  };
  r.readAsText(f, "UTF-8");
}

function exportCSV() {
  if (Object.keys(wordDatabase).length === 0) { alert("暂无单词可导出"); return; }
  let csv = "No,words,transliteration,chinese,example sentence\n";
  let n = 1;
  for (let w in wordDatabase) {
    const info = wordDatabase[w];
    csv += `${n},${w},${info.transliteration},${info.chinese},${info.example}\n`;
    n++;
  }
  const b = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const u = URL.createObjectURL(b);
  const a = document.createElement("a");
  a.href = u; a.download = `toeic_words_${getSafeDateKey()}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

function showAutoImportStatus(msg, type) {
  const el = document.getElementById("autoImportStatus");
  if (!el) return;
  clearTimeout(el.hideTimeout);
  el.innerHTML = msg;
  el.className = `auto-import-status ${type}`;
  el.style.display = "flex";
  el.hideTimeout = setTimeout(() => el.style.display = "none", 3000);
}

// 弹窗通用
function showModal(id) { document.getElementById(id).classList.add("active"); }
function closeModal(id) { document.getElementById(id).classList.remove("active"); }

// 每日统计图表
function showDailyChartModal() {
  const dates = Object.keys(dailyData).sort();
  const counts = dates.map(d => dailyData[d]);
  if (dailyChart) dailyChart.destroy();
  const ctx = document.getElementById("dailyChart");
  if (!ctx) return;
  const isDark = document.body.classList.contains("dark-theme");

  dailyChart = new Chart(ctx.getContext("2d"), {
    type: "line",
    data: {
      labels: dates,
      datasets: [{
        label: "每日学习单词数",
        data: counts,
        backgroundColor: "rgba(99,102,241,0.1)",
        borderColor: "#6366f1",
        borderWidth: 2,
        tension: 0.4,
        fill: true,
        pointBackgroundColor: "#fff",
        pointBorderColor: "#6366f1",
        pointBorderWidth: 2,
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDark ? "#27272a" : "rgba(255,255,255,0.9)",
          titleColor: isDark ? "#fafafa" : "#0f172a",
          bodyColor: isDark ? "#a1a1aa" : "#64748b",
          callbacks: {
            title: ctx => ctx[0].label,
            label: ctx => `学习了 ${ctx.raw} 个单词`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 10, color: isDark ? "#a1a1aa" : "#64748b" },
          grid: { color: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)" }
        },
        x: {
          grid: { display: false },
          ticks: { color: isDark ? "#a1a1aa" : "#64748b" }
        }
      }
    }
  });
  showModal("dailyChartModal");
}

// 初始化入口
window.onload = function () {
  initTheme();
  switchToList('unmastered');
  setupSwipeNavigation();
};

// 移动端左右滑动
function setupSwipeNavigation() {
  const wordCard = document.querySelector('.word-card');
  let startX = 0, startY = 0;
  const SWIPE_THRESHOLD = 50;

  wordCard.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  wordCard.addEventListener('touchend', (e) => {
    const endX = e.changedTouches[0].clientX;
    const diffX = endX - startX;
    if (Math.abs(diffX) > SWIPE_THRESHOLD) {
      if (diffX > 0) prevWord();
      else nextWord();
    }
  }, { passive: true });
}

// 搜索监听
const searchInput = document.getElementById("searchInput");
if (searchInput) {
  searchInput.addEventListener("input", function () {
    const v = this.value.toLowerCase();
    let baseList;
    switch (currentList) {
      case "unmastered": baseList = words.filter(w => !mastered[w]); break;
      case "favorites": baseList = favorites.filter(w => !mastered[w]); break;
      case "wrongWords": baseList = wrongWords.filter(w => !mastered[w]); break;
    }
    deck = baseList.filter(w => w.toLowerCase().includes(v));
    if (deck.length === 0) deck = ["无匹配结果"];
    index = 0;
    reveal = false;
    updateUI();
    setTimeout(speakWord, 100);
  });
}

// 点击遮罩关闭弹窗
["dailyChartModal","importModal","renameBackupModal","recordManagerModal","passwordVerifyModal"].forEach(id=>{
  document.getElementById(id).addEventListener("click",function(e){
    if(e.target===this) closeModal(id);
  });
});

// ESC 拦截
document.addEventListener("keydown", function(e) {
  if (e.key === "Escape") {
    if (document.getElementById("loginModal").classList.contains("active") && !isSwitchAccountMode) {
      e.preventDefault();
    }
    if (document.getElementById("selectBackupModal").classList.contains("active")) {
      e.preventDefault();
    }
  }
});
