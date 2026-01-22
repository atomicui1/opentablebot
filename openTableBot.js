// ==UserScript==
// @name         OpenTableBot
// @match        https://www.opentable.com/*
// @match        https://cdn.otstatic.com/maintenance/busy/index.html
// @version      0.3
// @description  snipe new reservations FAST
// @author       Nohren (modified)
// @grant        window.close
// @grant        GM.setValue
// @grant        GM.getValue
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  let isRunning = false;
  let isWaitingForDrop = false;
  let dropTimeout = null;
  let checkInterval = null;
  let targetDate = null;
  let targetStartTime = "17:00";
  let targetEndTime = "19:00";
  let refreshRateSeconds = 45;
  let dropTime = null; // Time when reservations drop (e.g., "10:00")
  let partySize = 2;

  // Convert 24hr time to 12hr for OpenTable
  function to12Hour(time24) {
    const [hour, minute] = time24.split(':').map(Number);
    const period = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minute.toString().padStart(2, '0')} ${period}`;
  }

  // Check if slot time is in range
  function isTimeInRange(slotText) {
    const timeMatch = slotText.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!timeMatch) return true;
    
    let hour = parseInt(timeMatch[1]);
    const minute = parseInt(timeMatch[2]);
    const period = timeMatch[3].toUpperCase();
    
    if (period === "PM" && hour !== 12) hour += 12;
    if (period === "AM" && hour === 12) hour = 0;
    
    const slotMinutes = hour * 60 + minute;
    const [startH, startM] = targetStartTime.split(':').map(Number);
    const [endH, endM] = targetEndTime.split(':').map(Number);
    
    return slotMinutes >= (startH * 60 + startM) && slotMinutes <= (endH * 60 + endM);
  }

  // INSTANT slot check - no delays
  function checkSlotsNow() {
    console.log(`[${new Date().toLocaleTimeString()}] Checking slots...`);
    const slots = document.querySelector("[data-test='time-slots']");
    
    if (!slots || !slots.children.length) {
      console.log("No slots container found or empty");
      return false;
    }

    for (const child of slots.children) {
      const link = child.firstChild;
      if (link && link.ariaLabel) {
        const slotText = link.innerText;
        console.log(`Found slot: ${slotText}`);
        
        if (isTimeInRange(slotText)) {
          console.log(`MATCH! Clicking ${slotText}`);
          updateStatus(`FOUND: ${slotText} - CLICKING!`, "lime");
          link.click();
          stopBot();
          return true;
        }
      }
    }
    return false;
  }

  // Refresh and check again
  function scheduleNextCheck() {
    if (!isRunning) return;
    
    const delay = refreshRateSeconds * 1000;
    console.log(`Next check in ${refreshRateSeconds}s`);
    updateStatus(`Sniping: ${targetDate} ${targetStartTime}-${targetEndTime} | Next check in ${refreshRateSeconds}s`, "lime");
    
    setTimeout(() => {
      if (isRunning) {
        window.location.reload();
      }
    }, delay);
  }

  // Main check function
  async function runCheck() {
    // Wait just a moment for page to render slots
    await new Promise(r => setTimeout(r, 500));
    
    const found = checkSlotsNow();
    if (!found && isRunning) {
      scheduleNextCheck();
    }
  }

  // Calculate ms until drop time
  function getMsUntilDrop(dropTimeStr) {
    const now = new Date();
    const [hours, minutes] = dropTimeStr.split(':').map(Number);
    const dropDate = new Date();
    dropDate.setHours(hours, minutes, 0, 0);
    
    // If drop time already passed today, it's for tomorrow
    if (dropDate <= now) {
      dropDate.setDate(dropDate.getDate() + 1);
    }
    
    return dropDate - now;
  }

  // Format ms to readable countdown
  function formatCountdown(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  }

  function startBot() {
    if (isRunning || isWaitingForDrop) return;
    
    // Get config from UI
    const dateInput = document.getElementById('sniper-date');
    const startInput = document.getElementById('sniper-start');
    const endInput = document.getElementById('sniper-end');
    const rateInput = document.getElementById('sniper-rate');
    const dropInput = document.getElementById('sniper-drop');
    const partyInput = document.getElementById('sniper-party');
    
    targetDate = dateInput.value;
    targetStartTime = startInput.value;
    targetEndTime = endInput.value;
    refreshRateSeconds = Math.max(10, parseInt(rateInput.value) || 45);
    dropTime = dropInput.value || null;
    partySize = parseInt(partyInput.value) || 2;
    
    if (!targetDate) {
      alert("Please enter a target date");
      return;
    }
    
    // Save config
    GM.setValue("sniperConfig", JSON.stringify({
      targetDate, targetStartTime, targetEndTime, refreshRateSeconds, dropTime, partySize, isRunning: true
    }));
    
    // If drop time is set, wait for it
    if (dropTime) {
      const msUntilDrop = getMsUntilDrop(dropTime);
      
      // If drop time is within 5 seconds, start immediately
      if (msUntilDrop <= 5000) {
        isRunning = true;
        updateStatus(`DROP TIME! Starting NOW...`, "lime");
        setTimeout(runCheck, 100);
        return;
      }
      
      isWaitingForDrop = true;
      updateStatus(`Waiting for drop at ${dropTime}...`, "orange");
      
      // Update countdown every second
      const countdownInterval = setInterval(() => {
        if (!isWaitingForDrop) {
          clearInterval(countdownInterval);
          return;
        }
        const remaining = getMsUntilDrop(dropTime);
        updateStatus(`Drop at ${dropTime} in ${formatCountdown(remaining)}`, "orange");
      }, 1000);
      
      // Schedule the start
      dropTimeout = setTimeout(() => {
        clearInterval(countdownInterval);
        isWaitingForDrop = false;
        isRunning = true;
        updateStatus(`DROP TIME! Refreshing in 1s...`, "lime");
        // Wait 1 second before refreshing
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }, msUntilDrop);
      
      return;
    }
    
    // No drop time - refresh instantly
    isRunning = true;
    updateStatus(`REFRESHING - Looking for ${targetStartTime}-${targetEndTime}...`, "lime");
    window.location.reload();
  }

  function stopBot() {
    isRunning = false;
    isWaitingForDrop = false;
    if (dropTimeout) {
      clearTimeout(dropTimeout);
      dropTimeout = null;
    }
    GM.setValue("sniperConfig", JSON.stringify({ isRunning: false }));
    updateStatus("STOPPED", "yellow");
    console.log("Bot stopped");
  }

  function updateStatus(text, color) {
    const statusEl = document.getElementById('sniper-status');
    if (statusEl) {
      statusEl.innerText = `🤖 ${text}`;
      statusEl.style.backgroundColor = color;
    }
  }

  // Calculate middle time between start and end
  function getMiddleTime(startTime, endTime) {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const middleMinutes = Math.floor((startMinutes + endMinutes) / 2);
    const midH = Math.floor(middleMinutes / 60);
    const midM = middleMinutes % 60;
    return `${midH}:${midM.toString().padStart(2, '0')}`;
  }

  // Set date/time/party on the OpenTable reservation widget
  async function setOpenTableDateTime() {
    const middleTime = getMiddleTime(targetStartTime, targetEndTime);
    const middleTime12 = to12Hour(middleTime);
    console.log(`Setting OpenTable: Date=${targetDate}, Time=${middleTime12}, Party=${partySize}`);
    updateStatus(`Setting: ${targetDate} @ ${middleTime12} for ${partySize}`, "orange");

    // Set party size
    await setPartySize(partySize);
    await new Promise(r => setTimeout(r, 300));

    // Set date
    await setDate(targetDate);
    await new Promise(r => setTimeout(r, 300));

    // Set time (middle of range)
    await setTime(middleTime);
    await new Promise(r => setTimeout(r, 500));

    updateStatus(`Set! Checking for ${targetStartTime}-${targetEndTime}...`, "lime");
  }

  // Debug: log all clickable elements in reservation widget
  function debugReservationWidget() {
    console.log("=== DEBUG: Scanning reservation widget ===");
    const widget = document.querySelector('[data-test="reservation-widget"]') || 
                   document.querySelector('form') ||
                   document.querySelector('[class*="reservation"]');
    
    if (widget) {
      const buttons = widget.querySelectorAll('button, [role="button"], [role="combobox"], select');
      buttons.forEach((btn, i) => {
        console.log(`Button ${i}: text="${btn.innerText?.slice(0,30)}" class="${btn.className?.slice(0,50)}" data-test="${btn.getAttribute('data-test')}" aria="${btn.getAttribute('aria-label')}"`);
      });
    }
    
    // Also check for any element containing "people" or time patterns
    const allElements = document.querySelectorAll('*');
    allElements.forEach(el => {
      const text = el.innerText || '';
      if ((text.includes('people') || text.match(/\d+:\d+\s*(AM|PM)/i)) && el.tagName === 'BUTTON') {
        console.log(`Found relevant button: "${text.slice(0,50)}" tag=${el.tagName}`);
      }
    });
  }

  // Find clickable element by text content
  function findButtonByText(patterns, container = document) {
    const buttons = container.querySelectorAll('button, [role="button"], [role="combobox"], [tabindex="0"]');
    for (const btn of buttons) {
      const text = (btn.innerText || btn.textContent || '').toLowerCase();
      for (const pattern of patterns) {
        if (typeof pattern === 'string' && text.includes(pattern.toLowerCase())) {
          return btn;
        } else if (pattern instanceof RegExp && pattern.test(text)) {
          return btn;
        }
      }
    }
    return null;
  }

  // Click dropdown and select party size
  async function setPartySize(size) {
    debugReservationWidget();
    
    // Find button containing "people" or "person" or party size number
    const partyBtn = findButtonByText(['people', 'person', 'guests', 'party']) ||
                     document.querySelector('[data-test="party-size-picker"]') ||
                     document.querySelector('[id*="party"]') ||
                     document.querySelector('[class*="party"]');
    
    if (!partyBtn) {
      console.log("Party size picker not found - may already be set correctly");
      return;
    }

    console.log(`Found party picker: "${partyBtn.innerText?.slice(0,30)}"`);
    partyBtn.click();
    await new Promise(r => setTimeout(r, 300));

    // Find the option with matching party size
    const options = document.querySelectorAll('[role="option"], [role="menuitem"], li, [data-test*="option"]');
    for (const opt of options) {
      const text = opt.innerText || opt.textContent || '';
      // Match "2 people" or just "2"
      if (text.match(new RegExp(`^${size}\\s*(people|person|guests)?$`, 'i')) ||
          text.match(new RegExp(`${size}\\s+people`, 'i'))) {
        console.log(`Selecting party size: ${text}`);
        opt.click();
        return;
      }
    }
    
    // Click outside to close dropdown if no match
    document.body.click();
    console.log("Could not find matching party size option");
  }

  // Click date picker and select date
  async function setDate(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const monthNames = ["January", "February", "March", "April", "May", "June",
                        "July", "August", "September", "October", "November", "December"];
    const monthAbbr = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    // Find date picker - look for button with month name or date pattern
    const dateBtn = findButtonByText([...monthAbbr, ...monthNames, /\d{1,2},\s*\d{4}/]) ||
                    document.querySelector('[data-test*="date"]') ||
                    document.querySelector('[id*="date"]') ||
                    document.querySelector('[aria-label*="date" i]');
    
    if (!dateBtn) {
      console.log("Date picker not found");
      return;
    }

    console.log(`Found date picker: "${dateBtn.innerText?.slice(0,30)}"`);
    dateBtn.click();
    await new Promise(r => setTimeout(r, 400));

    // Navigate to correct month
    for (let attempts = 0; attempts < 12; attempts++) {
      // Check if we're on the right month
      const calendarText = document.body.innerText;
      if (calendarText.includes(monthNames[month - 1]) || calendarText.includes(monthAbbr[month - 1])) {
        // Check year too
        if (calendarText.includes(year.toString())) {
          break;
        }
      }
      
      // Click next month
      const nextBtn = findButtonByText(['next', '>', '→', 'forward']) ||
                      document.querySelector('[aria-label*="next" i]') ||
                      document.querySelector('[data-test*="next"]');
      
      if (nextBtn) {
        nextBtn.click();
        await new Promise(r => setTimeout(r, 250));
      } else {
        break;
      }
    }

    // Click on the day - look for button/cell with just the day number
    await new Promise(r => setTimeout(r, 200));
    const dayStr = day.toString();
    const allClickable = document.querySelectorAll('button, [role="button"], td, [role="gridcell"]');
    
    for (const el of allClickable) {
      const text = el.innerText?.trim();
      // Exact match for day number
      if (text === dayStr) {
        const isDisabled = el.disabled || 
                          el.getAttribute('aria-disabled') === 'true' ||
                          el.classList.contains('disabled');
        if (!isDisabled) {
          console.log(`Selecting date: day ${day}`);
          el.click();
          return;
        }
      }
    }
    
    console.log("Could not find matching date");
  }

  // Click time picker and select time
  async function setTime(time24) {
    const time12 = to12Hour(time24);
    
    // Find time picker - look for button with time pattern like "7:00 PM"
    const timeBtn = findButtonByText([/\d{1,2}:\d{2}\s*(AM|PM)/i]) ||
                    document.querySelector('[data-test*="time"]') ||
                    document.querySelector('[id*="time"]') ||
                    document.querySelector('[aria-label*="time" i]');
    
    if (!timeBtn) {
      console.log("Time picker not found");
      return;
    }

    console.log(`Found time picker: "${timeBtn.innerText?.slice(0,30)}"`);
    timeBtn.click();
    await new Promise(r => setTimeout(r, 300));

    // Find matching time option
    const options = document.querySelectorAll('[role="option"], [role="menuitem"], li, [data-test*="option"]');
    const [targetH, targetM] = time24.split(':').map(Number);
    const targetMinutes = targetH * 60 + targetM;
    
    let closestOpt = null;
    let closestDiff = Infinity;

    for (const opt of options) {
      const optText = opt.innerText || '';
      const match = optText.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (match) {
        let h = parseInt(match[1]);
        const m = parseInt(match[2]);
        const p = match[3].toUpperCase();
        if (p === 'PM' && h !== 12) h += 12;
        if (p === 'AM' && h === 12) h = 0;
        const optMinutes = h * 60 + m;
        const diff = Math.abs(optMinutes - targetMinutes);
        
        // Exact match
        if (diff === 0) {
          console.log(`Selecting exact time: ${optText}`);
          opt.click();
          return;
        }
        
        if (diff < closestDiff) {
          closestDiff = diff;
          closestOpt = opt;
        }
      }
    }

    if (closestOpt && closestDiff <= 60) { // Within 1 hour
      console.log(`Selecting closest time: ${closestOpt.innerText} (${closestDiff} min diff)`);
      closestOpt.click();
    } else {
      document.body.click(); // Close dropdown
      console.log("Could not find matching time");
    }
  }

  // Auto-complete reservation on booking page
  function completeReservation() {
    console.log("On booking page - completing reservation");
    const completeBtn = document.querySelector("[data-test='complete-reservation-button']");
    if (completeBtn) {
      updateStatus("COMPLETING RESERVATION!", "lime");
      setTimeout(() => completeBtn.click(), 300);
    }
  }

  // Handle optional seating type selection (Standard vs High Top, etc.)
  function handleSeatingTypeSelection() {
    console.log("Checking for seating type selection...");
    
    // Look for seating options - OpenTable uses various selectors for this
    const seatingOptions = document.querySelectorAll('[data-test*="seating"], [data-test*="experience"], [class*="seating"], [class*="experience"]');
    
    // Also look for radio buttons or clickable options that might indicate seating type
    const standardOption = Array.from(document.querySelectorAll('button, [role="radio"], [role="option"], label, div[data-test]'))
      .find(el => {
        const text = (el.innerText || el.textContent || '').toLowerCase();
        return text.includes('standard') || text.includes('indoor') || text.includes('main dining');
      });
    
    if (standardOption) {
      console.log("Found standard seating option - clicking it");
      updateStatus("Selecting Standard seating...", "lime");
      standardOption.click();
      
      // After selecting, look for a continue/confirm button
      setTimeout(() => {
        const continueBtn = document.querySelector('[data-test*="continue"], [data-test*="confirm"], button[type="submit"]') ||
                           Array.from(document.querySelectorAll('button'))
                             .find(btn => {
                               const text = (btn.innerText || '').toLowerCase();
                               return text.includes('continue') || text.includes('confirm') || text.includes('next');
                             });
        if (continueBtn) {
          console.log("Clicking continue after seating selection");
          continueBtn.click();
        }
      }, 300);
      return true;
    }
    
    return false;
  }

  // Create control UI
  function createUI() {
    const container = document.createElement("div");
    container.id = "sniper-container";
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 999999;
      background: #333;
      padding: 10px;
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      font-family: Arial, sans-serif;
    `;

    // Status bar
    const status = document.createElement("div");
    status.id = "sniper-status";
    status.style.cssText = `
      padding: 8px 15px;
      background: yellow;
      font-weight: bold;
      font-size: 16px;
      border-radius: 4px;
    `;
    status.innerText = "🤖 READY";

    // Date input
    const dateLabel = createLabel("Date:");
    const dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.id = "sniper-date";
    dateInput.value = new Date().toISOString().split('T')[0];
    dateInput.style.cssText = "padding: 5px; font-size: 14px;";

    // Start time
    const startLabel = createLabel("From:");
    const startInput = document.createElement("input");
    startInput.type = "time";
    startInput.id = "sniper-start";
    startInput.value = "17:00";
    startInput.style.cssText = "padding: 5px; font-size: 14px;";

    // End time
    const endLabel = createLabel("To:");
    const endInput = document.createElement("input");
    endInput.type = "time";
    endInput.id = "sniper-end";
    endInput.value = "19:00";
    endInput.style.cssText = "padding: 5px; font-size: 14px;";

    // Refresh rate
    const rateLabel = createLabel("Refresh (s):");
    const rateInput = document.createElement("input");
    rateInput.type = "number";
    rateInput.id = "sniper-rate";
    rateInput.value = "45";
    rateInput.min = "10";
    rateInput.style.cssText = "padding: 5px; font-size: 14px; width: 60px;";

    // Drop time (when reservations become available)
    const dropLabel = createLabel("Drop at:");
    const dropInput = document.createElement("input");
    dropInput.type = "time";
    dropInput.id = "sniper-drop";
    dropInput.placeholder = "10:00";
    dropInput.style.cssText = "padding: 5px; font-size: 14px;";

    // Party size
    const partyLabel = createLabel("Party:");
    const partyInput = document.createElement("input");
    partyInput.type = "number";
    partyInput.id = "sniper-party";
    partyInput.value = "2";
    partyInput.min = "1";
    partyInput.max = "20";
    partyInput.style.cssText = "padding: 5px; font-size: 14px; width: 50px;";

    // GO button
    const goBtn = document.createElement("button");
    goBtn.innerText = "▶ GO";
    goBtn.style.cssText = `
      padding: 10px 25px;
      font-size: 16px;
      font-weight: bold;
      background: #00ff00;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    `;
    goBtn.onclick = startBot;

    // STOP button
    const stopBtn = document.createElement("button");
    stopBtn.innerText = "⏹ STOP";
    stopBtn.style.cssText = `
      padding: 10px 25px;
      font-size: 16px;
      font-weight: bold;
      background: #ff4444;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    `;
    stopBtn.onclick = stopBot;

    container.appendChild(status);
    container.appendChild(partyLabel);
    container.appendChild(partyInput);
    container.appendChild(dateLabel);
    container.appendChild(dateInput);
    container.appendChild(startLabel);
    container.appendChild(startInput);
    container.appendChild(endLabel);
    container.appendChild(endInput);
    container.appendChild(rateLabel);
    container.appendChild(rateInput);
    container.appendChild(dropLabel);
    container.appendChild(dropInput);
    container.appendChild(goBtn);
    container.appendChild(stopBtn);

    document.body.prepend(container);
    
    // Add margin to body so content isn't hidden
    document.body.style.marginTop = "60px";
  }

  function createLabel(text) {
    const label = document.createElement("span");
    label.innerText = text;
    label.style.cssText = "color: white; font-size: 14px;";
    return label;
  }

  // Check if we should auto-resume
  async function checkAutoResume() {
    try {
      const configStr = await GM.getValue("sniperConfig", "{}");
      const config = JSON.parse(configStr);
      
      if (config.isRunning) {
        // Restore config
        targetDate = config.targetDate;
        targetStartTime = config.targetStartTime;
        targetEndTime = config.targetEndTime;
        refreshRateSeconds = config.refreshRateSeconds;
        dropTime = config.dropTime;
        partySize = config.partySize || 2;
        
        // Update UI
        document.getElementById('sniper-date').value = targetDate;
        document.getElementById('sniper-start').value = targetStartTime;
        document.getElementById('sniper-end').value = targetEndTime;
        document.getElementById('sniper-rate').value = refreshRateSeconds;
        document.getElementById('sniper-party').value = partySize;
        if (dropTime) document.getElementById('sniper-drop').value = dropTime;
        
        isRunning = true;
        console.log("Auto-resuming sniper...");
        // Set the date/time/party on OpenTable widget first, then check
        setOpenTableDateTime().then(() => {
          setTimeout(runCheck, 1000);
        });
      }
    } catch (e) {
      console.log("No saved config");
    }
  }

  // Initialize
  function init() {
    createUI();
    
    // Handle booking page
    if (window.location.pathname === "/booking/details") {
      completeReservation();
      return;
    }
    
    // Handle seating type selection page (intermediate step between time slot and booking)
    // This page appears for some restaurants with multiple seating options
    if (window.location.pathname.includes("/booking") && !window.location.pathname.includes("/details")) {
      setTimeout(() => {
        const handled = handleSeatingTypeSelection();
        if (!handled) {
          // No seating selection found, might already be on details or different flow
          console.log("No seating type selection found - continuing");
        }
      }, 500);
    }
    
    // Handle kicked out
    if (window.location.pathname === "/maintenance/busy/index.html") {
      updateStatus("BLOCKED - Waiting 5min...", "red");
      setTimeout(() => window.history.back(), 5 * 60 * 1000);
      return;
    }
    
    // Check if we should auto-resume from a refresh
    setTimeout(checkAutoResume, 500);
  }

  // Run when DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
