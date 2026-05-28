// Legacy fallback for old Android/Chrome browsers (ES5 only)
(function () {
  "use strict";

  var API_CONFIG = {
    baseUrl: "https://billinghub.id/api",
    token: "UQ389HyIcsN0jaicPiXoZSiNIc99Mk27g00gv886ptGFtp6bWkMmk22b6TpPeEnw",
  };

  var companyData = null;
  var currentPackageId = 1;
  var vouchers = [];
  var settingData = null;
  var selectedVoucher = null;
  var paymentMethodsList = [];
  var selectedPaymentMethodCode = null;
  var qrinOrderKode = null;
  var qrinActivePaymentModal = "qrinPaymentModal";
  var qrinCheckPaymentBusy = false;

  function withHttpFallback(url) {
    if (typeof url !== "string") return url;
    if (url.indexOf("https://") === 0) {
      return "http://" + url.substring(8);
    }
    return url;
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function addClass(el, className) {
    if (!el) return;
    if (el.classList && el.classList.add) {
      el.classList.add(className);
      return;
    }
    if ((" " + el.className + " ").indexOf(" " + className + " ") === -1) {
      el.className = (el.className ? el.className + " " : "") + className;
    }
  }

  function removeClass(el, className) {
    if (!el) return;
    if (el.classList && el.classList.remove) {
      el.classList.remove(className);
      return;
    }
    var source = " " + (el.className || "") + " ";
    el.className = source.replace(" " + className + " ", " ").replace(/^\s+|\s+$/g, "");
  }

  function removeNode(node) {
    if (!node) return;
    if (node.remove) {
      node.remove();
    } else if (node.parentNode) {
      node.parentNode.removeChild(node);
    }
  }

  function showLoading(show) {
    var spinner = byId("loadingSpinner");
    if (!spinner) return;
    if (show) {
      addClass(spinner, "active");
    } else {
      removeClass(spinner, "active");
    }
  }

  function showAlert(message, type) {
    var kind = type || "info";
    var alertContainer = byId("alertContainer");
    if (!alertContainer) return;
    alertContainer.innerHTML =
      '<div class="alert alert-' +
      kind +
      '"><span>' +
      String(message) +
      '</span><button onclick="this.parentElement.remove()">×</button></div>';
    setTimeout(function () {
      if (alertContainer.firstChild) {
        removeNode(alertContainer.firstChild);
      }
    }, 5000);
  }

  function xhrJson(method, url, payload, done) {
    var allowRetry = true;

    function doRequest(targetUrl, callback) {
      var xhr = new XMLHttpRequest();
      var finished = false;

      function finish(err, data, status) {
        if (finished) return;
        finished = true;
        callback(err, data, status);
      }

      xhr.open(method, targetUrl, true);
      xhr.timeout = 30000;
      try {
        xhr.setRequestHeader("Accept", "application/json");
      } catch (e1) {}
      if (method === "POST") {
        try {
          xhr.setRequestHeader("Content-Type", "application/json");
        } catch (e2) {}
      }
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        var data = null;
        try {
          data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        } catch (e) {
          finish(new Error("Invalid JSON response"), null, xhr.status);
          return;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          finish(null, data, xhr.status);
        } else {
          finish(new Error("HTTP " + xhr.status), data, xhr.status);
        }
      };
      xhr.onerror = function () {
        finish(new Error("Network error"), null, 0);
      };
      xhr.ontimeout = function () {
        finish(new Error("Request timeout"), null, 0);
      };
      xhr.send(payload ? JSON.stringify(payload) : null);
    }

    doRequest(url, function (err, data, status) {
      var isNetIssue = !status || status === 0;
      if (!err || !allowRetry || !isNetIssue) {
        done(err, data, status);
        return;
      }
      var fallbackUrl = withHttpFallback(url);
      if (fallbackUrl === url) {
        done(err, data, status);
        return;
      }
      doRequest(fallbackUrl, done);
    });
  }

  function updateCompanyDisplay() {
    var title = byId("pageTitle");
    var section = byId("welcomeSection");
    var name = companyData && companyData.nama_perusahaan ? companyData.nama_perusahaan : "WiFi Login";

    if (title) title.textContent = "\uD83D\uDCF6 " + name;
    if (section) {
      var companyName = section.querySelector(".company-name");
      var contactInfo = section.querySelector(".contact-info");
      if (companyName) {
        companyName.textContent = companyData && companyData.nama_perusahaan ? companyData.nama_perusahaan : "WiFi Hotspot";
      }
      if (contactInfo) {
        contactInfo.textContent = "";
        contactInfo.style.display = "none";
      }
    }
  }

  function updateAdminContactInfo() {
    var el = byId("adminWhatsapp");
    if (!el) return;
    if (!companyData) {
      el.textContent = "6283874731480";
      return;
    }
    var raw = String(companyData.no_wa || companyData.formatted_whatsapp || "").replace(/\D/g, "");
    if (!raw) {
      el.textContent = "6283874731480";
      return;
    }
    if (raw.indexOf("62") !== 0) {
      if (raw.indexOf("0") === 0) {
        raw = "62" + raw.substring(1);
      } else if (raw.indexOf("8") === 0) {
        raw = "62" + raw;
      }
    }
    el.textContent = raw;
  }

  function renderSimpleError(message) {
    var list = byId("voucherList");
    var section = byId("priceSection");
    if (section) section.classList.remove("hidden");
    if (list) {
      list.innerHTML = '<div class="simple-error">' + String(message) + "</div>";
    }
  }

  function renderNoVouchers() {
    var list = byId("voucherList");
    var section = byId("priceSection");
    if (section) section.classList.add("hidden");
    if (list) list.innerHTML = "";
  }

  function parseHargaToNumber(hargaStr) {
    if (typeof hargaStr === "number") return hargaStr;
    var num = parseInt(String(hargaStr || "").replace(/\D/g, ""), 10);
    return isNaN(num) ? 0 : num;
  }

  function validateWhatsAppNumber(whatsapp) {
    var cleanNumber = String(whatsapp || "").replace(/\D/g, "");
    if (!cleanNumber) {
      return { valid: false, message: "Nomor WhatsApp harus diisi" };
    }
    if (cleanNumber.indexOf("62") !== 0 && cleanNumber.indexOf("0") !== 0) {
      return { valid: false, message: "Nomor WhatsApp harus diawali 62 atau 0" };
    }
    if (cleanNumber.length < 10) {
      return { valid: false, message: "Nomor WhatsApp terlalu pendek" };
    }
    if (cleanNumber.indexOf("0") === 0) {
      cleanNumber = "62" + cleanNumber.substring(1);
    }
    return { valid: true, apiFormat: cleanNumber };
  }

  function isQrinPaymentGateway() {
    var g = companyData && companyData.payment_gateway;
    return g === "Qrin Payment Gateway" || g === "Qrin";
  }

  function iconUrlForLegacy(url) {
    var raw = String(url || "").trim();
    if (!raw) return "";
    return withHttpFallback(raw);
  }

  function buildQrinOrderSummaryHtml(data) {
    var nominal = Math.round(Number((data && data.amount) || 0)) || 0;
    var storeId = data && data.store_id ? String(data.store_id) : "";
    var html = "";
    if (nominal > 0) {
      html +=
        '<div class="qrin-pay-summary-row"><span class="qrin-pay-summary-label">Nominal</span><span class="qrin-pay-summary-value">Rp ' +
        nominal.toLocaleString("id-ID") +
        "</span></div>";
      html +=
        '<div class="qrin-pay-summary-row qrin-pay-summary-totalpay"><span class="qrin-pay-summary-label">Total pembayaran</span><span class="qrin-pay-summary-value">Rp ' +
        nominal.toLocaleString("id-ID") +
        "</span></div>";
    }
    if (storeId) {
      html +=
        '<div class="qrin-pay-summary-row"><span class="qrin-pay-summary-label">Store ID</span><span class="qrin-pay-summary-value">' +
        storeId +
        "</span></div>";
    }
    return html;
  }

  function renderQrinQrFallbackImage(qrContent) {
    var container = byId("qrisCodeContainer");
    var canvas = byId("qrinQrCanvas");
    if (!container) return false;

    var oldImg = byId("qrinQrFallbackImg");
    if (oldImg) removeNode(oldImg);
    var oldTable = byId("qrinQrFallbackTableWrap");
    if (oldTable) removeNode(oldTable);

    if (canvas) canvas.style.display = "none";

    if (typeof QRCode === "function") {
      try {
        var wrapCtor = document.createElement("div");
        wrapCtor.id = "qrinQrFallbackTableWrap";
        wrapCtor.style.display = "block";
        wrapCtor.style.width = "220px";
        wrapCtor.style.height = "220px";
        wrapCtor.style.margin = "0 auto";
        wrapCtor.style.background = "#fff";
        wrapCtor.style.border = "1px solid #e5e7eb";
        wrapCtor.style.padding = "8px";
        container.appendChild(wrapCtor);
        new QRCode(wrapCtor, {
          text: qrContent,
          width: 200,
          height: 200,
        });
        return true;
      } catch (eCtor) {}
    }

    if (typeof QRCode !== "undefined" && QRCode.create) {
      try {
        var qrObj = QRCode.create(qrContent, { errorCorrectionLevel: "M" });
        var size = qrObj.modules.size;
        var data = qrObj.modules.data;
        var scale = 5;
        var quiet = 2;
        var html = '<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#fff;margin:0 auto;">';
        for (var r = -quiet; r < size + quiet; r++) {
          html += "<tr>";
          for (var c = -quiet; c < size + quiet; c++) {
            var black = false;
            if (r >= 0 && r < size && c >= 0 && c < size) {
              black = !!data[r * size + c];
            }
            html +=
              '<td style="width:' +
              scale +
              "px;height:" +
              scale +
              "px;background:" +
              (black ? "#000" : "#fff") +
              ';padding:0;margin:0;"></td>';
          }
          html += "</tr>";
        }
        html += "</table>";

        var wrap = document.createElement("div");
        wrap.id = "qrinQrFallbackTableWrap";
        wrap.style.display = "block";
        wrap.style.width = "100%";
        wrap.style.textAlign = "center";
        wrap.style.background = "#fff";
        wrap.style.border = "1px solid #e5e7eb";
        wrap.style.padding = "8px";
        wrap.style.maxWidth = "220px";
        wrap.style.margin = "0 auto";
        wrap.innerHTML = html;
        container.appendChild(wrap);
        return true;
      } catch (e) {}
    }

    var img = document.createElement("img");
    img.id = "qrinQrFallbackImg";
    img.alt = "QRIS";
    img.style.display = "block";
    img.style.width = "200px";
    img.style.height = "200px";
    img.style.margin = "0 auto";
    img.style.background = "#fff";
    img.style.border = "1px solid #e5e7eb";
    img.style.padding = "4px";

    if (typeof QRCode !== "undefined" && QRCode.toDataURL) {
      try {
        QRCode.toDataURL(qrContent, { width: 220, margin: 2 }, function (err, dataUrl) {
          if (!err && dataUrl) {
            img.onerror = function () {};
            img.src = dataUrl;
            container.appendChild(img);
          } else {
            showAlert("QR tidak bisa dirender di browser lama ini.", "warning");
          }
        });
      } catch (e) {
        showAlert("QR tidak bisa dirender di browser lama ini.", "warning");
      }
    } else {
      showAlert("QR tidak bisa dirender di browser lama ini.", "warning");
    }
    return true;
  }

  function showQrinPaymentModal(data) {
    var qrContent = data && data.qr_content ? String(data.qr_content) : "";
    if (!qrContent) {
      showAlert("Data QR tidak tersedia", "danger");
      return;
    }

    qrinOrderKode = data && data.kode_transaksi ? String(data.kode_transaksi) : null;
    qrinActivePaymentModal = "qrinPaymentModal";
    qrinInitCheckStatusUi("qr");

    closeModal("successModal");
    var summaryEl = byId("qrinQrSummary");
    if (summaryEl) {
      summaryEl.innerHTML = buildQrinOrderSummaryHtml(data);
      summaryEl.style.display = "block";
    }

    var canvas = byId("qrinQrCanvas");
    if (!canvas) {
      showAlert("Canvas QR tidak ditemukan", "danger");
      return;
    }
    var oldImg = byId("qrinQrFallbackImg");
    if (oldImg) removeNode(oldImg);
    canvas.style.display = "block";

    canvas.width = 0;
    canvas.height = 0;
    // Legacy devices often fail to paint canvas QR without throwing errors.
    // Force local table/dataURL renderer so QR stays visible offline/walled-garden.
    renderQrinQrFallbackImage(qrContent);

    openModal("qrinPaymentModal");
  }

  function showQrinVaModal(data) {
    qrinOrderKode = data && data.kode_transaksi ? String(data.kode_transaksi) : null;
    qrinActivePaymentModal = "qrinVaModal";
    qrinInitCheckStatusUi("va");

    closeModal("successModal");
    var body = byId("qrinVaModalBody");
    if (!body) return;
    var rows = [];
    if (data && data.va_number_list && data.va_number_list.length) {
      rows = data.va_number_list;
    } else if (data && data.va_number) {
      rows = [{ bank: data.va_bank || "Bank", va_number: data.va_number }];
    }
    if (!rows.length) {
      body.innerHTML =
        '<div class="tripay-method-empty">Nomor pembayaran tidak tersedia.</div>';
      openModal("qrinVaModal");
      return;
    }
    var html = "";
    for (var i = 0; i < rows.length; i++) {
      var bank = String(rows[i].bank || "Virtual Account");
      var num = String(rows[i].va_number || "");
      html +=
        '<div class="qrin-va-card"><div class="qrin-va-bank">' +
        bank +
        '</div><div class="qrin-va-num">' +
        num +
        "</div></div>";
    }
    body.innerHTML = html;
    openModal("qrinVaModal");
  }

  function qrinCheckStatusElements() {
    var isVa = qrinActivePaymentModal === "qrinVaModal";
    return {
      msgEl: byId(isVa ? "qrinVaPaymentStatusMsg" : "qrinPaymentStatusMsg"),
      btn: byId(isVa ? "qrinVaCheckPaymentBtn" : "qrinCheckPaymentBtn"),
      resultBox: byId(isVa ? "qrinVaVoucherResult" : "qrinVoucherResult"),
      codeEl: byId(isVa ? "qrinVaVoucherCodeDisplay" : "qrinVoucherCodeDisplay"),
      copyBtn: byId(isVa ? "qrinVaCopyVoucherBtn" : "qrinCopyVoucherBtn"),
    };
  }

  function qrinInitCheckStatusUi(which) {
    var isVa = which === "va";
    var msg = byId(isVa ? "qrinVaPaymentStatusMsg" : "qrinPaymentStatusMsg");
    var btn = byId(isVa ? "qrinVaCheckPaymentBtn" : "qrinCheckPaymentBtn");
    var resultBox = byId(isVa ? "qrinVaVoucherResult" : "qrinVoucherResult");
    var codeEl = byId(isVa ? "qrinVaVoucherCodeDisplay" : "qrinVoucherCodeDisplay");
    if (btn) {
      btn.style.display = "block";
      btn.disabled = false;
      btn.textContent = "Cek Pembayaran";
    }
    if (msg) {
      msg.style.display = "none";
      msg.textContent = "";
      msg.className = "qrin-status-msg";
    }
    if (resultBox) resultBox.style.display = "none";
    if (codeEl) codeEl.textContent = "";
  }

  function qrinCheckPaymentStatus() {
    if (!qrinOrderKode || qrinCheckPaymentBusy) return;
    var ui = qrinCheckStatusElements();
    qrinCheckPaymentBusy = true;

    if (ui.btn) {
      ui.btn.disabled = true;
      ui.btn.textContent = "Memeriksa...";
    }
    if (ui.msgEl) {
      ui.msgEl.style.display = "block";
      ui.msgEl.className = "qrin-status-msg qrin-status-msg--info";
      ui.msgEl.textContent = "Memeriksa status pembayaran...";
    }
    if (ui.resultBox) ui.resultBox.style.display = "none";

    xhrJson(
      "POST",
      API_CONFIG.baseUrl + "/v1/vouchers/" + API_CONFIG.token + "/cek-order-qrin",
      { kode_transaksi: qrinOrderKode },
      function (err, result) {
        qrinCheckPaymentBusy = false;
        var nextUi = qrinCheckStatusElements();

        if (nextUi.btn && nextUi.btn.style.display !== "none") {
          nextUi.btn.disabled = false;
          nextUi.btn.textContent = "Cek Pembayaran";
        }

        if (err || !result || !result.success || !result.data) {
          if (nextUi.msgEl) {
            nextUi.msgEl.style.display = "block";
            nextUi.msgEl.className = "qrin-status-msg qrin-status-msg--warn";
            nextUi.msgEl.textContent =
              (result && result.message) ||
              (err && err.message) ||
              "Gagal memeriksa status pembayaran.";
          }
          return;
        }

        var d = result.data;
        if (d.paid && d.processing) {
          if (nextUi.msgEl) {
            nextUi.msgEl.style.display = "block";
            nextUi.msgEl.className = "qrin-status-msg qrin-status-msg--info";
            nextUi.msgEl.textContent =
              result.message ||
              "Pembayaran diterima. Voucher sedang dibuat, coba lagi beberapa detik.";
          }
          return;
        }

        if (d.paid && d.username_voucher) {
          if (nextUi.msgEl) nextUi.msgEl.style.display = "none";
          if (nextUi.codeEl) nextUi.codeEl.textContent = d.username_voucher;
          if (nextUi.resultBox) nextUi.resultBox.style.display = "block";
          if (nextUi.copyBtn) {
            nextUi.copyBtn.onclick = function () {
              var ta = document.createElement("textarea");
              ta.value = d.username_voucher;
              document.body.appendChild(ta);
              ta.select();
              try {
                document.execCommand("copy");
                showAlert("Kode voucher disalin", "success");
              } catch (e) {}
              document.body.removeChild(ta);
            };
          }
          if (nextUi.btn) nextUi.btn.style.display = "none";
          showAlert("Pembayaran berhasil. Simpan kode voucher Anda.", "success");
          return;
        }

        if (nextUi.msgEl) {
          nextUi.msgEl.style.display = "block";
          nextUi.msgEl.className = "qrin-status-msg qrin-status-msg--pending";
          nextUi.msgEl.textContent =
            result.message ||
            "Pembayaran belum terkonfirmasi. Setelah membayar, tunggu beberapa detik lalu cek lagi.";
        }
      }
    );
  }

  function clearModalAlert() {
    var box = byId("modalAlertContainer");
    if (box) box.innerHTML = "";
  }

  function showModalAlert(message, type) {
    var box = byId("modalAlertContainer");
    var kind = type || "info";
    if (!box) return;
    box.innerHTML =
      '<div class="modal-alert modal-alert-' +
      kind +
      '"><span>' +
      String(message) +
      "</span></div>";
  }

  function selectPaymentMethodCard(el) {
    var idx = parseInt(el.getAttribute("data-idx"), 10);
    var selected = paymentMethodsList[idx];
    if (!selected) return;
    selectedPaymentMethodCode = selected.code || selected.channel_code || String(selected.id || "");

    var cards = document.querySelectorAll(".tripay-method-card");
    for (var i = 0; i < cards.length; i++) {
      removeClass(cards[i], "selected");
    }
    addClass(el, "selected");
  }

  function loadPaymentMethods(amount) {
    var grid = byId("tripayMethodGrid");
    var loading = byId("tripayMethodsLoading");
    if (!grid || !loading) return;

    loading.style.display = "block";
    grid.innerHTML = "";

    var urlWithAmount =
      API_CONFIG.baseUrl +
      "/v1/vouchers/" +
      API_CONFIG.token +
      "/payment-methods?amount=" +
      encodeURIComponent(amount);
    var urlWithoutAmount =
      API_CONFIG.baseUrl +
      "/v1/vouchers/" +
      API_CONFIG.token +
      "/payment-methods";

    function assignMethodsFromResult(result) {
      if (!result || !result.data) return [];
      if (result.data.methods && result.data.methods.length) return result.data.methods;
      if (result.data.data && result.data.data.methods && result.data.data.methods.length) {
        return result.data.data.methods;
      }
      if (result.data.length) return result.data;
      return [];
    }

    function renderMethods() {
      if (!paymentMethodsList.length) {
        grid.innerHTML =
          '<div class="tripay-method-empty">Tidak ada metode pembayaran untuk nominal ini</div>';
        return;
      }
      var html = "";
      for (var i = 0; i < paymentMethodsList.length; i++) {
        var m = paymentMethodsList[i];
        var icon = iconUrlForLegacy(m.icon_url || m.logo_url || "");
        var name = String(m.name || m.label || m.group || m.code || "Metode");
        var imgHtml = icon
          ? '<img src="' +
            icon +
            '" alt="' +
            name +
            '" class="tripay-method-icon" onerror="this.style.display=\'none\'; this.parentNode.innerHTML=\'<span class=&quot;tripay-method-placeholder&quot;>💳</span>\';">'
          : '<span class="tripay-method-placeholder">💳</span>';
        html +=
          '<div class="tripay-method-card" data-idx="' +
          i +
          '" onclick="selectPaymentMethodCard(this)">' +
          '<div class="tripay-method-frame">' +
          imgHtml +
          "</div>" +
          '<div class="tripay-method-name">' +
          name +
          "</div></div>";
      }
      grid.innerHTML = html;
      applyModalLegacyPaint(byId("buyVoucherModal"));
    }

    function requestMethods(url, onDone) {
      xhrJson("GET", url, null, function (err, result) {
        if (err || !result || result.success === false) {
          onDone(err || new Error((result && result.message) || "Request gagal"), result);
          return;
        }
        paymentMethodsList = assignMethodsFromResult(result);
        onDone(null, result);
      });
    }

    requestMethods(urlWithAmount, function (err1) {
      if (!err1 && paymentMethodsList.length) {
        loading.style.display = "none";
        renderMethods();
        return;
      }

      requestMethods(urlWithoutAmount, function (err2, result2) {
        loading.style.display = "none";
        if (err2 || !paymentMethodsList.length) {
          var backendMsg = result2 && result2.message ? String(result2.message) : "";
          var techMsg = err2 && err2.message ? String(err2.message) : "";
          var msg = backendMsg || techMsg || "Gagal memuat metode pembayaran di browser lama";
          grid.innerHTML = '<div class="tripay-method-empty">' + String(msg) + "</div>";
          return;
        }
        renderMethods();
      });
    });
  }

  function showBuyModal(voucherId) {
    if (currentPackageId < 2) {
      showAlert("Untuk pembelian voucher, hubungi admin", "warning");
      return;
    }

    for (var i = 0; i < vouchers.length; i++) {
      if (String(vouchers[i].id) === String(voucherId)) {
        selectedVoucher = vouchers[i];
        break;
      }
    }
    if (!selectedVoucher) {
      showAlert("Voucher tidak ditemukan", "danger");
      return;
    }

    clearModalAlert();
    selectedPaymentMethodCode = null;
    paymentMethodsList = [];

    var info = byId("selectedVoucherInfo");
    if (info) {
      info.innerHTML =
        "<p><strong>Paket:</strong> " +
        String(selectedVoucher.nama_voucher || "-") +
        "</p>" +
        "<p><strong>Harga:</strong> " +
        String(selectedVoucher.harga || "-") +
        "</p>" +
        "<p><strong>Durasi:</strong> " +
        String(selectedVoucher.batas_waktu || "-") +
        "</p>";
    }

    var needPaymentMethod = companyData && companyData.need_payment_method === true;
    var paymentGroup = byId("paymentMethodGroup");
    if (paymentGroup) {
      paymentGroup.style.display = needPaymentMethod ? "block" : "none";
    }

    var nameEl = byId("customerName");
    var waEl = byId("customerWhatsapp");
    if (nameEl) nameEl.value = "";
    if (waEl) waEl.value = "";

    if (needPaymentMethod) {
      loadPaymentMethods(parseHargaToNumber(selectedVoucher.harga));
    }
    openModal("buyVoucherModal");
  }

  function processPurchase(event) {
    if (event && event.preventDefault) event.preventDefault();

    if (!selectedVoucher || !settingData) {
      showModalAlert("Data voucher tidak valid", "danger");
      return false;
    }

    var name = (byId("customerName") ? byId("customerName").value : "").trim();
    var whatsapp = (byId("customerWhatsapp") ? byId("customerWhatsapp").value : "").trim();
    var submitBtn = byId("submitOrderBtn");
    clearModalAlert();

    if (!name || name.length < 5) {
      showModalAlert("Nama minimal 5 karakter", "warning");
      return false;
    }

    var waCheck = validateWhatsAppNumber(whatsapp);
    if (!waCheck.valid) {
      showModalAlert(waCheck.message, "warning");
      return false;
    }

    var needPaymentMethod = companyData && companyData.need_payment_method === true;
    if (needPaymentMethod && !selectedPaymentMethodCode) {
      showModalAlert("Pilih metode pembayaran terlebih dahulu", "warning");
      return false;
    }

    var payload = {
      voucher_id: selectedVoucher.id,
      wa_number: waCheck.apiFormat,
      nama_pembeli: name,
      settingmikrotik_id: settingData.id,
      company_id: settingData.company_id,
    };

    if (needPaymentMethod) {
      if (isQrinPaymentGateway()) {
        payload.qrin_payment_method = selectedPaymentMethodCode;
      } else {
        payload.payment_method = selectedPaymentMethodCode;
      }
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = "Memproses...";
    }

    xhrJson(
      "POST",
      API_CONFIG.baseUrl + "/v1/vouchers/" + API_CONFIG.token + "/order",
      payload,
      function (err, result) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = "Beli Sekarang";
        }
        if (err || !result || !result.success) {
          showModalAlert(
            (result && result.message) || "Gagal membuat order. Coba lagi.",
            "danger"
          );
          return;
        }

        var data = result.data || {};
        closeModal("buyVoucherModal");
        var successMsg = byId("successMessage");
        if (successMsg) {
          successMsg.textContent = "Order berhasil dibuat! Membuka metode pembayaran...";
        }
        openModal("successModal");

        if (isQrinPaymentGateway() && data.qr_content) {
          setTimeout(function () {
            showQrinPaymentModal(data);
          }, 700);
          return;
        }
        if (
          isQrinPaymentGateway() &&
          (data.payment_kind === "VA" || (data.va_number_list && data.va_number_list.length) || data.va_number)
        ) {
          setTimeout(function () {
            showQrinVaModal(data);
          }, 700);
          return;
        }
        if (data.payment_url) {
          window.open(data.payment_url, "_blank", "noopener,noreferrer");
          showAlert("Buka halaman pembayaran berhasil", "success");
          closeModal("successModal");
          return;
        }
        showAlert("Order berhasil dibuat", "success");
        closeModal("successModal");
      }
    );

    return false;
  }

  function renderVouchers(data) {
    var list = byId("voucherList");
    var section = byId("priceSection");
    if (!list) return;
    if (!data || !data.length) {
      renderNoVouchers();
      return;
    }
    vouchers = data;
    settingData = null;
    if (vouchers.length > 0) {
      settingData = {
        id: vouchers[0].settingmikrotik_id,
        company_id: vouchers[0].company_id,
      };
    }
    if (section) section.classList.remove("hidden");

    var html = "";
    for (var i = 0; i < data.length; i++) {
      var v = data[i];
      html +=
        '<div class="price-card" onclick="showBuyModal(' +
        String(v.id || 0) +
        ')">' +
        '<div class="price-left"><div class="price-icon price-icon--ticket"><span class="price-icon__label">V</span></div><div class="price-info">' +
        '<div class="price-title">' +
        String(v.nama_voucher || "-") +
        "</div>" +
        '<div class="price-duration">' +
        String(v.batas_waktu || "-") +
        "</div></div></div>" +
        '<div class="price-right"><span class="price-amount">' +
        String(v.harga || "-") +
        '</span><span class="price-cta">Beli paket</span></div></div>';
    }
    list.innerHTML = html;
  }

  function loadCompanyInfo() {
    xhrJson("GET", API_CONFIG.baseUrl + "/v1/company/" + API_CONFIG.token, null, function (err, data) {
      if (!err && data && data.success && data.data) {
        companyData = data.data;
        currentPackageId = companyData.paket_id || 1;
      }
      updateCompanyDisplay();
      updateAdminContactInfo();
    });
  }

  function loadVouchers() {
    showLoading(true);
    xhrJson("GET", API_CONFIG.baseUrl + "/v1/vouchers/" + API_CONFIG.token, null, function (err, data, status) {
      showLoading(false);
      if (err) {
        if (status === 403) {
          renderNoVouchers();
          return;
        }
        renderSimpleError("Gagal memuat voucher. Periksa koneksi internet / dukungan TLS browser.");
        return;
      }
      if (data && data.success === true && data.data) {
        renderVouchers(data.data);
      } else if (data && data.success === false) {
        renderSimpleError(data.message || "Tidak ada voucher tersedia");
      } else {
        renderNoVouchers();
      }
    });
  }

  function submitVoucher() {
    var input = byId("kodeVoucher");
    var submitBtn = byId("submitVoucherBtn");
    var form = document.forms.loginvoucher;
    var voucherCode = input ? String(input.value || "").trim() : "";

    if (!voucherCode) {
      showAlert("Silahkan masukkan kode voucher", "warning");
      return;
    }
    if (!form) {
      showAlert("Form login tidak ditemukan", "danger");
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Memproses...";
    }

    try {
      form.username.value = voucherCode;
      var chapId = "$(chap-id)" || "";
      var chapChallenge = "$(chap-challenge)" || "";

      if (typeof md5 === "function") {
        form.password.value = md5(chapId + voucherCode + chapChallenge);
      } else {
        form.password.value = voucherCode;
      }

      showLoading(true);
      setTimeout(function () {
        form.submit();
      }, 500);
    } catch (e) {
      showAlert("Terjadi kesalahan saat login", "danger");
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Masuk";
      }
      showLoading(false);
    }
  }

  function openExternalQRScanner() {
    var callback = encodeURIComponent(window.location.href);
    window.open(
      "https://scan-qr.billinghub.id/?callback=" + callback,
      "_blank",
      "noopener,noreferrer"
    );
    showAlert("Membuka scanner QR code di tab baru...", "info");
  }

  function copyToClipboard(elementId) {
    var element = byId(elementId);
    if (!element) return;
    var cleanText = String(element.textContent || "").replace(/[^\d]/g, "");
    var textArea = document.createElement("textarea");
    textArea.value = cleanText;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand("copy");
      showAlert("Nomor berhasil disalin!", "success");
    } catch (e) {
      showAlert("Gagal menyalin", "danger");
    }
    document.body.removeChild(textArea);
  }

  function applyModalLegacyPaint(modal) {
    if (!modal) return;
    modal.style.display = "block";
    modal.style.position = "fixed";
    modal.style.top = "0";
    modal.style.left = "0";
    modal.style.width = "100%";
    modal.style.height = "100%";
    modal.style.zIndex = "10000";
    modal.style.backgroundColor = "rgba(0,0,0,0.72)";
    modal.style.overflowY = "auto";
    modal.style.textAlign = "center";
    var content = modal.querySelector ? modal.querySelector(".modal-content") : null;
    if (content) {
      content.style.backgroundColor = "#ffffff";
      content.style.opacity = "1";
      content.style.display = "inline-block";
      content.style.textAlign = "left";
      content.style.verticalAlign = "middle";
      content.style.margin = "16px auto";
      content.style.maxWidth = "500px";
      content.style.width = "100%";
      content.style.borderRadius = "14px";
      content.style.boxShadow = "0 12px 28px rgba(0,0,0,0.35)";
    }
    var header = modal.querySelector ? modal.querySelector(".modal-header") : null;
    if (header) header.style.backgroundColor = "#ffffff";
    var body = modal.querySelector ? modal.querySelector(".modal-body") : null;
    if (body) body.style.backgroundColor = "#ffffff";
    var inputs = modal.getElementsByTagName ? modal.getElementsByTagName("input") : [];
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].style.backgroundColor = "#ffffff";
      inputs[i].style.color = "#333333";
      inputs[i].style.border = "1px solid #dee2e6";
    }
    var textareas = modal.getElementsByTagName ? modal.getElementsByTagName("textarea") : [];
    for (var j = 0; j < textareas.length; j++) {
      textareas[j].style.backgroundColor = "#ffffff";
      textareas[j].style.color = "#333333";
      textareas[j].style.border = "1px solid #dee2e6";
    }
    var primaryBtns = modal.querySelectorAll
      ? modal.querySelectorAll(".btn-primary")
      : [];
    for (var k = 0; k < primaryBtns.length; k++) {
      if (!primaryBtns[k].style.backgroundColor) {
        primaryBtns[k].style.backgroundColor = "#13737d";
      }
      primaryBtns[k].style.color = "#ffffff";
    }
  }

  function openModal(modalId) {
    var modal = byId(modalId);
    if (!modal) return;
    addClass(modal, "active");
    applyModalLegacyPaint(modal);
    document.body.style.overflow = "hidden";
  }

  function closeModal(modalId) {
    var modal = byId(modalId);
    if (!modal) return;
    removeClass(modal, "active");
    modal.style.display = "none";
    document.body.style.overflow = "";
  }

  function toggleTheme() {
    // Light mode only on legacy fallback
  }

  window.showLoading = showLoading;
  window.showAlert = showAlert;
  window.submitVoucher = submitVoucher;
  window.openExternalQRScanner = openExternalQRScanner;
  window.copyToClipboard = copyToClipboard;
  window.openModal = openModal;
  window.closeModal = closeModal;
  window.toggleTheme = toggleTheme;
  window.loadVouchers = loadVouchers;
  window.showBuyModal = showBuyModal;
  window.processPurchase = processPurchase;
  window.selectPaymentMethodCard = selectPaymentMethodCard;
  window.qrinCheckPaymentStatus = qrinCheckPaymentStatus;

  function isThemedLandingPage() {
    var body = document.body;
    return body && body.className && body.className.indexOf("lp-") === 0;
  }

  function ensureThemePageScroll() {
    if (!isThemedLandingPage()) return;
    var body = document.body;
    if (body) {
      body.style.overflowY = "auto";
      body.style.webkitOverflowScrolling = "touch";
    }
    var app = document.querySelector(".pwa-app");
    if (app) {
      app.style.height = "auto";
      app.style.maxHeight = "none";
      app.style.overflow = "visible";
    }
    var main = document.querySelector(".pwa-main");
    if (main) {
      main.style.overflowY = "visible";
      main.style.height = "auto";
      main.style.display = "block";
    }
  }

  var appInitialized = false;
  function initializeApp() {
    if (appInitialized) return;
    appInitialized = true;

    ensureThemePageScroll();

    document.body.classList.remove("dark");
    var input = byId("kodeVoucher");
    if (input) {
      input.addEventListener("keypress", function (e) {
        e = e || window.event;
        if (e.key === "Enter" || e.keyCode === 13) {
          if (e.preventDefault) e.preventDefault();
          submitVoucher();
        }
      });
    }
    loadCompanyInfo();
    loadVouchers();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeApp);
  } else {
    initializeApp();
  }
})();
