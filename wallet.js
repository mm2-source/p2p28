/* eslint-disable no-console */

window.P2P = window.P2P || {};
window.P2P.utils = window.P2P.utils || {};

// 1. تنسيق الأرقام
window.P2P.utils.format2 = window.P2P.utils.format2 || function format2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0.00";
  return x.toFixed(2);
};

// 2. نظام التنبيهات (Toast)
window.P2P.toast = window.P2P.toast || function toast(message) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = message;
    el.style.display = "block";
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(() => { el.style.display = "none"; }, 2600);
  };

window.P2P.state = window.P2P.state || {};
window.P2P.state.userProfileUnsubscribe = window.P2P.state.userProfileUnsubscribe || null;

// ─────────────────────────────────────────────────────────────
// ⭐ MULTI-NETWORK: دالة مشتركة تكشف الشبكة من TronLink
//    وترجع عنوان عقد USDT الصحيح تلقائياً.
//    Mainnet : TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
//    Nile    : TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf
// ─────────────────────────────────────────────────────────────
function getUSDTContractAddress() {
  const tw = window.tronWeb;
  if (!tw) return "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"; // default mainnet
  const host = (tw.fullNode && tw.fullNode.host) ? String(tw.fullNode.host) : "";
  const isNile = /nile/i.test(host);
  return isNile
    ? "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf"  // Nile testnet
    : "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"; // Mainnet
}

// ─────────────────────────────────────────────────────────────
// ⭐ WITHDRAW BUTTON STATE: دالة مركزية لضبط حالة زر السحب.
//    isPending=true  → قفل + "قيد المراجعة"
//    isPending=false → فتح + "سحب"
//    يُستدعى من:
//      - subscribeUserProfile (onSnapshot) — كل مرة يتفتح الصفحة
//      - withdrawUSDT — فوراً بعد تقديم الطلب
// ─────────────────────────────────────────────────────────────
function _setWithdrawBtnState(isPending) {
  const btn = document.getElementById("withdrawBtn");
  if (!btn) return;
  if (isPending) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> قيد المراجعة...`;
  } else {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-arrow-up-from-bracket"></i> تحويل للفوري`;
  }
}

// ─────────────────────────────────────────────────────────────
// 3. الربط اللحظي مع الفايربيز
//    ⭐ PERSISTENT WITHDRAW: نقرأ حقل isWithdrawPending من document
//       المستخدم ونضبط زر السحب فوراً — حتى بعد Refresh.
// ─────────────────────────────────────────────────────────────
window.P2P.subscribeUserProfile = function subscribeUserProfile(address) {
  const db = window.db;
  if (!db || !address) return;

  if (window.P2P.state.userProfileUnsubscribe) {
    window.P2P.state.userProfileUnsubscribe();
  }

  const userRef = db.collection("users").doc(address);
  window.P2P.state.userProfileUnsubscribe = userRef.onSnapshot(async (doc) => {
    if (doc.exists) {
      const userData = doc.data();
      window.P2P.state.availableBalance = userData.availableBalance || 0;
      // ⭐ DUAL BALANCE: الصندوق التاني (الفوري) — لو الحقل غير موجود في الفايربيز هيقع لـ 0
      window.P2P.state.instantBalance   = userData.instantBalance   || 0;

      // ⭐ PERSISTENT WITHDRAW: ضبط زر السحب حسب isWithdrawPending في Firestore
      //    بيشتغل حتى بعد Refresh — الأدمن هو اللي يرجّع الحالة لـ false.
      _setWithdrawBtnState(userData.isWithdrawPending === true);
    } else {
      window.P2P.state.availableBalance = 0;
      window.P2P.state.instantBalance   = 0;
      await userRef.set({
        availableBalance: 0,
        instantBalance: 0,
        lockedBalance: 0,
        isWithdrawPending: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    window.P2P.refreshHeaderBalanceUI();
    window.P2P.refreshWalletBalanceUI();
  }, (error) => {
    console.error("Firebase Error:", error);
  });
};

// ⭐ DUAL BALANCE: helper بيلوّن أي صندوق رصيد على حسب قيمته (أخضر > 0، أحمر = 0)
function _paintBalanceBox(box, value) {
    if (!box) return;
    box.classList.remove("balanceChip--ok", "balanceChip--zero");
    if (Number(value) > 0) {
        box.classList.add("balanceChip--ok");   // أخضر
    } else {
        box.classList.add("balanceChip--zero"); // أحمر
    }
}

// 4. تحديث رصيد الهيدر — صندوق التمويل فقط (الفوري القديم اتشال؛ الفوري الحي بقى صندوق مستقل)
window.P2P.refreshHeaderBalanceUI = function() {
    const wrap          = document.getElementById("headerBalance");
    const fundingBox    = document.getElementById("headerBalanceFunding");
    const fundingTextEl = document.getElementById("headerBalanceText");
    if (!wrap || !fundingTextEl) return;

    const fundingBal = window.P2P.state.availableBalance || 0;

    // 1) تحديث نص التمويل
    fundingTextEl.textContent = `التمويل: ${window.P2P.utils.format2(fundingBal)}`;

    // 2) إظهار الصندوق — في كل الصفحات عدا صفحة إعلاناتي (ads).
    if ((window.P2P.state.currentPageKey || "p2p") !== "ads") {
        wrap.style.display = "inline-flex";
    } else {
        wrap.style.display = "none";
    }

    // 3) تلوين صندوق التمويل (أخضر لو > 0، أحمر لو = 0)
    _paintBalanceBox(fundingBox, fundingBal);
};

window.P2P.refreshWalletBalanceUI = function() {
    const balanceEl = document.getElementById("walletBalance");
    if (balanceEl) {
        balanceEl.textContent = window.P2P.utils.format2(window.P2P.state.availableBalance || 0);
    }
};

// 5. دالة زر الحد الأقصى
window.P2P.setMaxAmount = function() {
    const amountInput = document.getElementById("adAmount");
    const bal = window.P2P.state.availableBalance || 0;
    if (amountInput) {
        amountInput.value = bal;
        amountInput.dispatchEvent(new Event('input'));
    }
};


  function _showAmountModal(opts) {
    return new Promise(function(resolve) {
      var old = document.getElementById('_p2pAmountModal');
      if (old) old.remove();
      var ov = document.createElement('div');
      ov.id = '_p2pAmountModal';
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.62);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;font-family:"IBM Plex Sans Arabic",system-ui,sans-serif';
      ov.innerHTML =
        '<div style="background:rgba(15,15,15,0.82);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border-radius:22px;padding:26px 22px 22px;width:100%;max-width:360px;box-shadow:0 24px 64px rgba(0,0,0,0.28);border:1px solid var(--line,rgba(0,0,0,.08));direction:rtl;">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">' +
            '<span style="font-size:20px;font-weight:800;color:#fff;">' + opts.title + '</span>' +
            '<button id="_p2pMC" style="background:var(--chip,#f3f4f6);border:none;cursor:pointer;color:var(--muted,#6b7280);font-size:14px;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;">✕</button>' +
          '</div>' +
          (opts.hint ? '<div style="font-size:13px;color:var(--muted,#6b7280);margin-bottom:16px;font-weight:500;">' + opts.hint + '</div>' : '<div style="height:12px;"></div>') +
          '<div style="background:var(--input,#f9fafb);border-radius:14px;border:1.5px solid var(--line,rgba(0,0,0,.1));display:flex;align-items:center;padding:0 16px;gap:10px;">' +
            '<input id="_p2pMI" type="number" inputmode="decimal" min="0" step="any" placeholder="' + (opts.placeholder||'0.00') + '" style="flex:1;border:none;background:transparent;padding:16px 0;font-size:22px;font-weight:700;color:#fff;outline:none;;width:100%;font-family:inherit;" />' +
            '<span style="color:var(--muted,#6b7280);font-weight:700;font-size:14px;flex-shrink:0;white-space:nowrap;">USDT</span>' +
          '</div>' +
          '<button id="_p2pMOk" style="width:100%;margin-top:16px;padding:16px;background:#000;color:#fff;border:none;border-radius:14px;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;">' + (opts.confirmLabel||'تأكيد') + '</button>' +
          '<button id="_p2pMCn" style="width:100%;margin-top:10px;padding:13px;background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:14px;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;">إلغاء</button>' +
        '</div>';
      document.body.appendChild(ov);
      var inp = document.getElementById('_p2pMI');
      function close(v){ ov.remove(); resolve(v); }
      ov.addEventListener('click', function(e){ if(e.target===ov) close(null); });
      document.getElementById('_p2pMC').addEventListener('click', function(){ close(null); });
      document.getElementById('_p2pMCn').addEventListener('click', function(){ close(null); });
      document.getElementById('_p2pMOk').addEventListener('click', function(){ var v=(inp.value||'').trim(); close(v||null); });
      inp.addEventListener('keydown', function(e){
        if(e.key==='Enter'){ var v=(inp.value||'').trim(); close(v||null); }
        if(e.key==='Escape') close(null);
      });
      requestAnimationFrame(function(){ requestAnimationFrame(function(){ inp.focus(); }); });
    });
  }

  // ─────────────────────────────────────────────────────────────
// 6. دالة الإيداع — تعمل على Mainnet و Nile تلقائياً
//    ⭐ MULTI-NETWORK: تستخدم getUSDTContractAddress() المشترك
// ─────────────────────────────────────────────────────────────
window.P2P.depositUSDT = async function() {
  try {
    const amount = await _showAmountModal({ title: 'تحويل USDT', placeholder: '0.00', confirmLabel: 'تحويل للتمويل' });
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) return;

    const tronWeb = window.tronWeb;
    if (!tronWeb || !tronWeb.ready) {
      window.P2P.toast("يرجى ربط محفظة TronLink أولاً");
      return;
    }

    const addr = tronWeb.defaultAddress.base58;

    // ⭐ MULTI-NETWORK: عنوان العقد الصحيح حسب الشبكة الحالية
    const USDT_CONTRACT = getUSDTContractAddress();
    console.log("[wallet] depositUSDT — network:", tronWeb.fullNode?.host, "| contract:", USDT_CONTRACT);

    // ⭐ DEPOSIT GUARD: تحقق من رصيد البلوكشين الحقيقي أولاً
    try {
      const contractCheck = await tronWeb.contract().at(USDT_CONTRACT);
      const rawBalance = await contractCheck.balanceOf(addr).call();
      const onchainBalance = Number(rawBalance.toString()) / 1000000;

      if (parseFloat(amount) > onchainBalance) {
        window.P2P.toast(
          `رصيدك في الفوري (${window.P2P.utils.format2(onchainBalance)} USDT) لا يكفي لهذا الإيداع`
        );
        return;
      }
    } catch (balErr) {
      console.warn("[wallet] depositUSDT: balanceOf check failed", balErr);
      // لا نوقف الإيداع لو فشل قراءة الرصيد (مشكلة شبكة مؤقتة)
    }

    const contract = await tronWeb.contract().at(USDT_CONTRACT);
    const unformattedAmount = Math.floor(parseFloat(amount) * 1000000);

    window.P2P.toast("جاري تأكيد التحويل لمحفظه التمويل انتظر...");

    // إرسال المعاملة للمحفظة المركزية
    const result = await contract.transfer("TE5VR1wVGgqvCJJGPkub3URLJF6M1TbtkD", unformattedAmount).send();

    if (result) {
      window.P2P.toast("جاري التحويل انتظر ...");
      // تحديث الرصيد في الفايربيز (Atomic Transaction)
      const userRef = window.db.collection("users").doc(addr);
      await window.db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        const oldBalance = userDoc.exists ? (userDoc.data().availableBalance || 0) : 0;
        transaction.set(userRef, {
          availableBalance: oldBalance + parseFloat(amount)
        }, { merge: true });
      });

      window.P2P.toast("تم التحويل وتحديث رصيدك بنجاح!");
    }
  } catch (error) {
    console.error("Deposit failed:", error);
    window.P2P.toast("فشلت عملية التحويل");
  }
};

// ─────────────────────────────────────────────────────────────
// 7. دالة طلب السحب
//    ⭐ PERSISTENT WITHDRAW:
//      - يكتب isWithdrawPending: true في document المستخدم داخل
//        نفس الـ transaction — مش بس في جدول withdrawals.
//      - subscribeUserProfile.onSnapshot يقرأ الحقل ده فوراً
//        ويقفل الزر حتى بعد أي Refresh.
//      - الزر يرجع عادي فقط لما الأدمن يوافق من لوحة التحكم
//        ويغير isWithdrawPending لـ false في Firestore.
// ─────────────────────────────────────────────────────────────
window.P2P.withdrawUSDT = async function() {
  const bal = window.P2P.state.availableBalance || 0;

  // 1. طلب المبلغ
  const amount = await _showAmountModal({ title: 'تحويل USDT', hint: `المتاح: ${window.P2P.utils.format2(bal)} USDT`, placeholder: '0.00', confirmLabel: 'تحويل للفوري' });
  if (!amount || isNaN(amount) || parseFloat(amount) <= 0) return;
  if (parseFloat(amount) > bal) {
    window.P2P.toast("الكمية المطلوبة أكبر من رصيدك المتاح");
    return;
  }

  // 2. قفل الزر فوراً (UX — قبل ما الـ onSnapshot يرجع)
  _setWithdrawBtnState(true);

  try {
    const tronWeb = window.tronWeb;
    if (!tronWeb || !tronWeb.ready || !tronWeb.defaultAddress?.base58) {
      window.P2P.toast("يرجى ربط محفظة TronLink أولاً");
      _setWithdrawBtnState(false);
      return;
    }

    const addr = tronWeb.defaultAddress.base58;
    const userRef = window.db.collection("users").doc(addr);

    await window.db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) throw "المستخدم غير موجود";

      const currentBal = userDoc.data().availableBalance || 0;
      if (currentBal < parseFloat(amount)) throw "رصيد غير كافٍ";

      // ⭐ PERSISTENT WITHDRAW: خصم الرصيد + تسجيل الحالة في document المستخدم
      transaction.update(userRef, {
        availableBalance: currentBal - parseFloat(amount),
        isWithdrawPending: true          // الأدمن هو اللي يرجّعه false
      });

      // تسجيل الطلب في جدول withdrawals (للأدمن)
      const withdrawRef = window.db.collection("withdrawals").doc();
      transaction.set(withdrawRef, {
        userAddress: addr,
        amount: parseFloat(amount),
        status: "pending",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    window.P2P.toast("تم تقديم طلب السحب بنجاح — جاري المراجعة!");
    // الـ onSnapshot في subscribeUserProfile سيقرأ isWithdrawPending=true
    // ويبقّي الزرار مقفولاً تلقائياً حتى بعد Refresh.

  } catch (error) {
    console.error("Withdraw Error:", error);
    window.P2P.toast(error === "رصيد غير كافٍ" ? error : "فشلت العملية");

    // رجّع الزرار فقط لو حصل خطأ (الطلب لم يُسجَّل)
    _setWithdrawBtnState(false);
  }
};

// ─────────────────────────────────────────────────────────────
// 8. الدالة الأساسية لربط المحفظة
//    ⭐ تنظيف: أُزيل re-definition متداخل لـ subscribeUserProfile
//       كان بيتشغّل بس لما connectWallet يُستدعى يدوياً،
//       وكان بيتجاهل في حالة autoReconnect.
//       الآن subscribeUserProfile نفسه يهتم بكل حاجة.
// ─────────────────────────────────────────────────────────────
window.P2P.connectWallet = async function connectWallet() {
    try {
      if (window.tronLink) await window.tronLink.request({ method: "tron_requestAccounts" });
      if (!window.tronWeb) {
        window.P2P.toast("يرجى تثبيت TronLink");
        return;
      }

      const addr = window.tronWeb.defaultAddress.base58;
      window.P2P.state.connectedAddress = addr;

      // حفظ العنوان للـ Auto-Reconnect عند تنقل الصفحات
      try { localStorage.setItem("p2p_address", addr); } catch (_) {}

      // تشغيل subscribeUserProfile (يتولى isWithdrawPending + الأرصدة)
      window.P2P.subscribeUserProfile(addr);

      const btn = document.getElementById("connectBtn");
      if (btn) {
        btn.className = "chip chip--ok";
        btn.innerHTML = `<i class="fa-solid fa-circle-check"></i><span>${addr.slice(0, 4)}...${addr.slice(-4)}</span>`;
      }

      // ربط الأزرار بعد الاتصال
      const maxBtn = document.getElementById("maxBtn");
      if (maxBtn) maxBtn.onclick = () => window.P2P.setMaxAmount();

      const depositBtn = document.getElementById("depositBtn");
      if (depositBtn) depositBtn.onclick = () => window.P2P.depositUSDT();

      const withdrawBtn = document.getElementById("withdrawBtn");
      if (withdrawBtn) withdrawBtn.onclick = () => window.P2P.withdrawUSDT();

      document.dispatchEvent(new CustomEvent("p2p:walletConnected", { detail: { address: addr } }));

    } catch (e) {
      console.error(e);
      window.P2P.toast("فشل ربط المحفظة");
    }
  };

window.connectWallet = () => window.P2P.connectWallet();

/* ============================================================
   SPA FIX — Auto-Reconnect Wallet Silently on Page Load
   ============================================================
   - بيقرأ العنوان المحفوظ من localStorage
   - بيستنى TronLink يحقن tronWeb (حتى 12 ثانية)
   - بيعمل ربط صامت من غير ما يطلب موافقة المستخدم تاني
   - بيشغّل subscribeUserProfile + بيحدّث UI زر الاتصال
   - بيدزّن p2p:walletConnected عشان كل الـ subscribers يعرفوا
   ============================================================ */
window.P2P.autoReconnectWallet = async function autoReconnectWallet() {
  try {
    const savedAddr = localStorage.getItem("p2p_address");
    if (!savedAddr) {
      console.log("[wallet] no saved address — skipping auto-reconnect");
      return;
    }

    // استنى لحد ما tronWeb يبقى جاهز ومعاه عنوان (max ~12s)
    let tries = 0;
    while (
      tries < 60 &&
      (!window.tronWeb || !window.tronWeb.ready || !window.tronWeb.defaultAddress?.base58)
    ) {
      await new Promise((r) => setTimeout(r, 200));
      tries++;
    }

    const liveAddr = window.tronWeb?.defaultAddress?.base58;
    if (!liveAddr) {
      console.warn("[wallet] auto-reconnect: tronWeb not ready after timeout");
      return;
    }

    // استخدم العنوان الحالي من tronWeb (يدعم تبديل الحساب من TronLink)
    window.P2P.state.connectedAddress = liveAddr;
    try { localStorage.setItem("p2p_address", liveAddr); } catch (_) {}

    // اشترك في بروفايل المستخدم — يتولى isWithdrawPending + الأرصدة تلقائياً
    if (typeof window.P2P.subscribeUserProfile === "function") {
      window.P2P.subscribeUserProfile(liveAddr);
    }

    // حدّث زر الاتصال
    const btn = document.getElementById("connectBtn");
    if (btn) {
      btn.className = "chip chip--ok";
      btn.innerHTML = `<i class="fa-solid fa-circle-check"></i><span>${liveAddr.slice(0, 4)}...${liveAddr.slice(-4)}</span>`;
    }

    // أعد ربط الأزرار
    const maxBtn = document.getElementById("maxBtn");
    if (maxBtn) maxBtn.onclick = () => window.P2P.setMaxAmount();
    const depositBtn = document.getElementById("depositBtn");
    if (depositBtn) depositBtn.onclick = () => window.P2P.depositUSDT();
    const withdrawBtn = document.getElementById("withdrawBtn");
    if (withdrawBtn) withdrawBtn.onclick = () => window.P2P.withdrawUSDT();

    // بلّغ كل الـ subscribers (chat list, orders list, ads, إلخ)
    document.dispatchEvent(new CustomEvent("p2p:walletConnected", { detail: { address: liveAddr } }));
    console.log("[wallet] ✓ auto-reconnect succeeded:", liveAddr);
  } catch (e) {
    console.warn("[wallet] auto-reconnect failed:", e);
  }
};

// مستمع لتبديل الحساب من داخل TronLink (لو المستخدم غيّر المحفظة)
window.addEventListener("message", function (e) {
  if (!e?.data?.message) return;
  const action = e.data.message.action;
  if (action === "setAccount" || action === "accountsChanged" || action === "tronLink_setAccount") {
    const newAddr = e.data.message.data?.address || window.tronWeb?.defaultAddress?.base58;
    if (newAddr && newAddr !== window.P2P.state.connectedAddress) {
      try { localStorage.setItem("p2p_address", newAddr); } catch (_) {}
      // إعادة ربط صامتة بالعنوان الجديد
      window.P2P.autoReconnectWallet();
    }
  }
});

// شغّل auto-reconnect لمّا الـ DOM يجهز
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => window.P2P.autoReconnectWallet());
} else {
  // الصفحة جاهزة بالفعل — شغّل فوراً
  window.P2P.autoReconnectWallet();
}

/* ============================================================
   ⭐ ON-CHAIN INSTANT BALANCE (standalone header box)
   ============================================================
   - يقرأ رصيد USDT الحقيقي من عقد TRC20 عبر contract.balanceOf(addr)
   - ⭐ MULTI-NETWORK: يستخدم getUSDTContractAddress() المشترك
   - يقسم على 1,000,000 (USDT decimals = 6)
   - تحديث كل 5 ثوانٍ + بعد ربط المحفظة + عند تغيير الحساب
   - يعرض "Connect" لو TronLink غير متاح
   ============================================================ */
window.P2P.refreshOnchainInstantUI = async function refreshOnchainInstantUI() {
  const el  = document.getElementById("headerInstantOnchainText");
  const box = document.getElementById("headerInstantOnchain");
  if (!el) return;

  const tw = window.tronWeb;
  if (!tw || !tw.ready || !tw.defaultAddress || !tw.defaultAddress.base58) {
    el.textContent = "الفوري: Connect";
    if (box) box.classList.remove("balanceChip--ok", "balanceChip--zero");
    return;
  }

  try {
    const addr = tw.defaultAddress.base58;

    // ⭐ MULTI-NETWORK: عنوان العقد الصحيح حسب الشبكة
    const USDT_ADDR = getUSDTContractAddress();

    const contract = await tw.contract().at(USDT_ADDR);
    const raw = await contract.balanceOf(addr).call();
    const balance = Number(raw.toString()) / 1000000;

    el.textContent = `الفوري: ${window.P2P.utils.format2(balance)}`;
    if (box) {
      box.classList.remove("balanceChip--ok", "balanceChip--zero");
      box.classList.add(balance > 0 ? "balanceChip--ok" : "balanceChip--zero");
    }
  } catch (err) {
    console.warn("[onchain] balanceOf failed:", err);
    el.textContent = "الفوري: 0.00";
    if (box) {
      box.classList.remove("balanceChip--ok");
      box.classList.add("balanceChip--zero");
    }
  }
};

// تحديث دوري كل 5 ثوانٍ
setInterval(() => {
  try { window.P2P.refreshOnchainInstantUI(); } catch (_) {}
}, 5000);

// تحديث فوري عند ربط المحفظة
document.addEventListener("p2p:walletConnected", () => {
  window.P2P.refreshOnchainInstantUI();
});

// تحديث أولي عند تحميل الصفحة
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => window.P2P.refreshOnchainInstantUI());
} else {
  window.P2P.refreshOnchainInstantUI();
}

/* ============================================================
   ⭐ KEYBOARD / VISUAL-VIEWPORT FIX
   ============================================================
   مشكلتين كنا بنشوفهم:
   1) لما الكيبورد بتفتح الصفحة بـ"تتشد" لتحت ومش قادر تطلع بالـ input فوق.
   2) الـ input بيتقفل ورا الكيبورد ومش قادرة تشوفه أثناء الكتابة.

   الحل:
   - نضبط CSS variable --vh على ارتفاع visualViewport الحقيقي
     (بدل 1vh التقليدي اللي بيشمل ارتفاع الكيبورد).
   - عند focus على input/textarea نسحب العنصر ليكون فوق الكيبورد.
   ============================================================ */
(function setupKeyboardAwareViewport() {
  function setVhVar() {
    const h = (window.visualViewport && window.visualViewport.height)
      ? window.visualViewport.height
      : window.innerHeight;
    document.documentElement.style.setProperty('--vh', (h * 0.01) + 'px');
  }

  setVhVar();

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', setVhVar);
    window.visualViewport.addEventListener('scroll', setVhVar);
  } else {
    window.addEventListener('resize', setVhVar);
  }

  // عند فتح أي input/textarea: استنى الكيبورد يفتح ثم اسحب الـ input لمكان مرئي
  function isEditable(el) {
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'textarea') return true;
    if (tag === 'input') {
      const t = (el.type || '').toLowerCase();
      // تجاهل الأنواع غير الكتابية
      return !['button','submit','reset','checkbox','radio','file','range','color','hidden'].includes(t);
    }
    return false;
  }

  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!isEditable(el)) return;
    // الكيبورد بياخد ~250–350ms عشان يفتح بالكامل
    setTimeout(() => {
      try {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch (_) {
        try { el.scrollIntoView(); } catch (__) {}
      }
    }, 280);
  });
})();
