(() => {
  const NS = "http://www.w3.org/2000/svg";
  const colors = { "帧起始": "#5d7280", "仲裁段": "#8b5d7a", "控制段": "#3f7d78", "数据段": "#a87532", "CRC 段": "#58719b", "ACK 段": "#3f8159", "帧结束": "#788387", "帧间隔": "#a0a9ab" };
  const shortLabels = { "CRC Del": "CDel", "ACK Del": "ADel" };
  const descriptions = {
    SOF: "1 个显性位，表示一帧开始。",
    ID: "11 位标准帧标识符，数值越小仲裁优先级越高。",
    "ID-A": "扩展帧标识符的高 11 位。",
    SRR: "扩展帧替代远程请求位，固定为隐性 1。",
    IDE: "标识符扩展位：0 为标准帧，1 为扩展帧。",
    "ID-B": "扩展帧标识符的低 18 位。",
    RTR: "远程传输请求位；当前为数据帧，固定为显性 0。",
    r0: "保留位，固定为显性 0。",
    r1: "扩展帧保留位，固定为显性 0。",
    DLC: "数据长度码，固定 8 字节，因此为 1000。",
    CRC: "发送节点根据 SOF 至数据段计算的 15 位 CRC。",
    "CRC Del": "CRC 界定符，固定为隐性 1。",
    ACK: "接收节点正确收到帧后在此发送显性 0。",
    "ACK Del": "ACK 界定符，固定为隐性 1。",
    EOF: "7 个连续隐性位，表示数据帧结束。",
    IFS: "3 个连续隐性位，保证相邻帧之间留有间隔。"
  };
  const state = { bitWidth: 22, highlightedBit: null, highlightedLabel: "" };
  const byteContainer = document.getElementById("dataBytes");

  for (let index = 0; index < 8; index += 1) {
    const label = document.createElement("label");
    label.className = "byte-field";
    label.innerHTML = `<span>DATA${index}</span><input id="byte${index}" type="text" value="00" maxlength="2" inputmode="text" aria-label="数据字节 ${index}">`;
    byteContainer.appendChild(label);
  }

  const toBits = (value, length) => Array.from({ length }, (_, index) => (value >> BigInt(length - 1 - index)) & 1n ? 1 : 0);
  const appendField = (target, field, bits, group) => bits.forEach((bit) => target.push({ bit, field, group, stuff: false }));
  const appendIdField = (target, field, bits, highestBit) => bits.forEach((bit, index) => target.push({ bit, field, group: "仲裁段", stuff: false, idBit: highestBit - index }));

  function crc15(bits) {
    let crc = 0;
    for (const bit of bits) {
      const feedback = ((crc >> 14) & 1) ^ bit;
      crc = (crc << 1) & 0x7fff;
      if (feedback) crc ^= 0x4599;
    }
    return crc;
  }

  function applyBitStuffing(items) {
    const output = [];
    let previous = null;
    let run = 0;
    for (const item of items) {
      output.push(item);
      if (item.bit === previous) run += 1;
      else { previous = item.bit; run = 1; }
      if (run === 5) {
        const stuffBit = item.bit ^ 1;
        output.push({ bit: stuffBit, field: item.field, group: item.group, stuff: true });
        previous = stuffBit;
        run = 1;
      }
    }
    return output;
  }

  function parseInputs() {
    const frameType = document.querySelector('input[name="frameType"]:checked').value;
    const maxId = frameType === "standard" ? 0x7ff : 0x1fffffff;
    const idText = document.getElementById("canId").value.trim().replace(/^0x/i, "");
    if (!/^[0-9a-f]+$/i.test(idText)) throw new Error("通信 ID 请输入十六进制数。");
    const id = Number.parseInt(idText, 16);
    if (id > maxId) throw new Error(frameType === "standard" ? "标准帧 ID 不能超过 0x7FF。" : "扩展帧 ID 不能超过 0x1FFFFFFF。");
    const data = Array.from({ length: 8 }, (_, index) => {
      const text = document.getElementById(`byte${index}`).value.trim();
      if (!/^[0-9a-f]{1,2}$/i.test(text)) throw new Error(`DATA${index} 请输入 00–FF。`);
      return Number.parseInt(text, 16);
    });
    return { frameType, id, data, bitrate: Number(document.getElementById("bitrate").value) };
  }

  function buildFrame({ frameType, id, data }) {
    const crcInput = [];
    appendField(crcInput, "SOF", [0], "帧起始");
    if (frameType === "standard") {
      appendIdField(crcInput, "ID", toBits(BigInt(id), 11), 10);
      appendField(crcInput, "RTR", [0], "仲裁段");
      appendField(crcInput, "IDE", [0], "控制段");
      appendField(crcInput, "r0", [0], "控制段");
    } else {
      const idValue = BigInt(id);
      appendIdField(crcInput, "ID-A", toBits(idValue >> 18n, 11), 28);
      appendField(crcInput, "SRR", [1], "仲裁段");
      appendField(crcInput, "IDE", [1], "仲裁段");
      appendIdField(crcInput, "ID-B", toBits(idValue & 0x3ffffn, 18), 17);
      appendField(crcInput, "RTR", [0], "仲裁段");
      appendField(crcInput, "r1", [0], "控制段");
      appendField(crcInput, "r0", [0], "控制段");
    }
    appendField(crcInput, "DLC", [1, 0, 0, 0], "控制段");
    data.forEach((byte, index) => appendField(crcInput, `DATA${index}`, toBits(BigInt(byte), 8), "数据段"));
    const checksum = crc15(crcInput.map((item) => item.bit));
    const stuffedArea = [...crcInput];
    appendField(stuffedArea, "CRC", toBits(BigInt(checksum), 15), "CRC 段");
    const wire = applyBitStuffing(stuffedArea);
    appendField(wire, "CRC Del", [1], "CRC 段");
    appendField(wire, "ACK", [0], "ACK 段");
    appendField(wire, "ACK Del", [1], "ACK 段");
    appendField(wire, "EOF", [1, 1, 1, 1, 1, 1, 1], "帧结束");
    appendField(wire, "IFS", [1, 1, 1], "帧间隔");
    return { crcInput, encodedFields: stuffedArea, wire, checksum };
  }

  const svgElement = (name, attributes = {}) => {
    const node = document.createElementNS(NS, name);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  };

  function getRuns(items, property) {
    const runs = [];
    items.forEach((item, index) => {
      const value = item[property];
      const last = runs[runs.length - 1];
      if (!last || last.value !== value) runs.push({ value, start: index, length: 1 });
      else last.length += 1;
    });
    return runs;
  }

  function drawWaveform(wire, bitrate) {
    const svg = document.getElementById("waveform");
    const left = 74;
    const bitWidth = state.bitWidth;
    const width = Math.max(900, left + wire.length * bitWidth + 30);
    const height = 480;
    svg.replaceChildren();
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("width", width);
    svg.setAttribute("height", height);

    const defs = svgElement("defs");
    const pattern = svgElement("pattern", { id: "minorGrid", width: bitWidth, height: 20, patternUnits: "userSpaceOnUse" });
    pattern.appendChild(svgElement("path", { d: `M ${bitWidth} 0 L 0 0 0 20`, fill: "none", stroke: "#dde5e5", "stroke-width": ".8" }));
    defs.appendChild(pattern);
    svg.appendChild(defs);
    svg.appendChild(svgElement("rect", { x: left, y: 84, width: width - left, height: 260, fill: "url(#minorGrid)" }));

    const fieldRuns = getRuns(wire, "field");
    const groupRuns = getRuns(wire, "group");
    wire.forEach((item, index) => {
      if (item.stuff) svg.appendChild(svgElement("rect", { x: left + index * bitWidth, y: 30, width: bitWidth, height: 314, fill: "#d19b2a", opacity: ".15" }));
    });
    groupRuns.forEach((run) => {
      const x = left + run.start * bitWidth;
      const runWidth = run.length * bitWidth;
      const color = colors[run.value] || "#889";
      svg.appendChild(svgElement("rect", { x, y: 5, width: runWidth, height: 20, fill: color, opacity: ".93" }));
      if (runWidth >= 52) {
        const text = svgElement("text", { x: x + runWidth / 2, y: 19, "text-anchor": "middle", fill: "#fff", "font-size": "10", "font-weight": "700", "font-family": "Inter, sans-serif" });
        text.textContent = run.value;
        svg.appendChild(text);
      }
    });
    fieldRuns.forEach((run) => {
      const x = left + run.start * bitWidth;
      const runWidth = run.length * bitWidth;
      const color = colors[wire[run.start].group] || "#889";
      svg.appendChild(svgElement("rect", { x, y: 30, width: runWidth, height: 22, fill: color, opacity: ".72", stroke: "#fff", "stroke-width": ".7" }));
      const label = shortLabels[run.value] || run.value;
      if (runWidth >= Math.max(34, label.length * 7 + 8)) {
        const text = svgElement("text", { x: x + runWidth / 2, y: 45, "text-anchor": "middle", fill: "#fff", "font-size": "9", "font-weight": "700", "font-family": "Inter, sans-serif" });
        text.textContent = label;
        svg.appendChild(text);
      } else {
        const center = x + runWidth / 2;
        svg.appendChild(svgElement("line", { x1: center, y1: 52, x2: center, y2: 60, stroke: color, "stroke-width": "1" }));
        const text = svgElement("text", { x: center + 2, y: 62, fill: "#43575c", "font-size": "8", "font-weight": "700", "font-family": "Inter, sans-serif", transform: `rotate(-55 ${center + 2} 62)` });
        text.textContent = label;
        svg.appendChild(text);
      }
    });

    const rows = [
      { label: "Logic", yHigh: 92, yLow: 130, color: "#334f56", value: (bit) => bit ? 92 : 130 },
      { label: "CAN_H", yHigh: 188, yLow: 224, color: "#c33d45", value: (bit) => bit ? 224 : 188 },
      { label: "CAN_L", yHigh: 268, yLow: 304, color: "#286ea2", value: (bit) => bit ? 268 : 304 },
      { label: "CANH-L", yHigh: 348, yLow: 384, color: "#7d5ba6", value: (bit) => bit ? 384 : 348 }
    ];
    rows.forEach((row) => {
      const label = svgElement("text", { x: 12, y: (row.yHigh + row.yLow) / 2 + 4, fill: "#607579", "font-size": "11", "font-weight": "700" });
      label.textContent = row.label;
      svg.appendChild(label);
      const values = wire.map((item) => row.value(item.bit));
      let path = `M ${left} ${values[0]}`;
      values.forEach((value, index) => {
        const x2 = left + (index + 1) * bitWidth;
        path += ` H ${x2}`;
        if (index < values.length - 1 && values[index + 1] !== value) path += ` V ${values[index + 1]}`;
      });
      svg.appendChild(svgElement("path", { d: path, fill: "none", stroke: row.color, "stroke-width": "3", "stroke-linejoin": "miter" }));
    });

    wire.forEach((item, index) => {
      if (bitWidth < 15 && index % 2) return;
      const text = svgElement("text", { x: left + (index + .5) * bitWidth, y: 145, "text-anchor": "middle", fill: item.stuff ? "#a87008" : "#738487", "font-size": bitWidth >= 17 ? "9" : "8", "font-family": "Consolas, monospace" });
      text.textContent = item.bit;
      svg.appendChild(text);
    });

    const bitTimeUs = 1000000 / bitrate;
    const axisY = 430;
    svg.appendChild(svgElement("line", { x1: left, y1: axisY, x2: width - 20, y2: axisY, stroke: "#94a5a8", "stroke-width": "1" }));
    const tickEvery = Math.max(1, Math.ceil(55 / bitWidth));
    for (let index = 0; index <= wire.length; index += tickEvery) {
      const x = left + index * bitWidth;
      svg.appendChild(svgElement("line", { x1: x, y1: axisY - 4, x2: x, y2: axisY + 4, stroke: "#94a5a8" }));
      const text = svgElement("text", { x, y: 448, "text-anchor": "middle", fill: "#738487", "font-size": "9", "font-family": "Consolas, monospace" });
      text.textContent = `${(index * bitTimeUs).toFixed(bitTimeUs < 1 ? 1 : 0)} µs`;
      svg.appendChild(text);
    }

    if (Number.isInteger(state.highlightedBit) && state.highlightedBit < wire.length) {
      const x = left + state.highlightedBit * bitWidth;
      const marker = svgElement("g", { id: "wireBitLocator", "pointer-events": "none" });
      marker.appendChild(svgElement("rect", { x, y: 53, width: bitWidth, height: 375, fill: "#087f7b", opacity: ".09", stroke: "#087f7b", "stroke-width": "2" }));
      const labelWidth = Math.max(104, state.highlightedLabel.length * 6 + 14);
      const labelX = Math.max(left, Math.min(x + bitWidth / 2 - labelWidth / 2, width - labelWidth - 10));
      marker.appendChild(svgElement("rect", { x: labelX, y: 61, width: labelWidth, height: 21, rx: "3", fill: "#075f5c" }));
      const label = svgElement("text", { x: labelX + labelWidth / 2, y: 75, "text-anchor": "middle", fill: "#fff", "font-size": "9", "font-weight": "700", "font-family": "Consolas, monospace" });
      label.textContent = state.highlightedLabel;
      marker.appendChild(label);
      svg.appendChild(marker);
    }
  }

  function groupBits(items) {
    return items.map((item, index) => `${item.bit}${(index + 1) % 8 === 0 ? " " : ""}`).join("").trim();
  }

  function locateWireBit(bitIndex, label = `wire bit ${bitIndex}`) {
    state.highlightedBit = bitIndex;
    state.highlightedLabel = label;
    const inputs = parseInputs();
    drawWaveform(buildFrame(inputs).wire, inputs.bitrate);
    const scroller = document.getElementById("waveformScroller");
    const target = Math.max(0, 74 + bitIndex * state.bitWidth - scroller.clientWidth * 0.18);
    scroller.scrollTo({ left: target, behavior: "smooth" });
    scroller.focus({ preventScroll: true });
  }

  function renderIdMap(frame, inputs) {
    const width = inputs.frameType === "standard" ? 11 : 29;
    const paddedHex = inputs.id.toString(16).toUpperCase().padStart(inputs.frameType === "standard" ? 3 : 8, "0");
    const binary = inputs.id.toString(2).padStart(width, "0");
    const groupedHexBits = binary.length % 4 ? `${binary.slice(0, binary.length % 4)} ${binary.slice(binary.length % 4).match(/.{4}/g).join(" ")}` : binary.match(/.{4}/g).join(" ");
    document.getElementById("idHexValue").textContent = `0x${paddedHex}`;

    const breakdown = document.getElementById("idBreakdown");
    if (inputs.frameType === "standard") {
      breakdown.innerHTML = `<span>0x${paddedHex} = ${groupedHexBits}</span><span>ID10…ID0 = ${binary}</span><span>发送顺序 = ID10 → ID0（MSB first）</span>`;
    } else {
      const idAValue = Math.floor(inputs.id / 2 ** 18);
      const idBValue = inputs.id % 2 ** 18;
      const idABits = binary.slice(0, 11);
      const idBBits = binary.slice(11);
      breakdown.innerHTML = `<span>0x${paddedHex} = ${groupedHexBits}</span><span>29-bit ID = ${binary}</span><span>ID-A：ID28…ID18 = ${idABits} = 0x${idAValue.toString(16).toUpperCase().padStart(3, "0")}</span><span>ID-B：ID17…ID0 = ${idBBits} = 0x${idBValue.toString(16).toUpperCase().padStart(5, "0")}</span><span>线上顺序：ID-A → SRR → IDE → ID-B → RTR</span>`;
    }

    const map = document.getElementById("idBitMap");
    map.replaceChildren();
    frame.wire.forEach((item, wireIndex) => {
      if (item.group !== "仲裁段") return;
      if (item.stuff) {
        const stuff = document.createElement("div");
        stuff.className = "id-stuff-bit";
        stuff.innerHTML = `<span>STUFF</span><strong>${item.bit}</strong><span>wire ${wireIndex}</span>`;
        stuff.title = "自动插入的填充位，不属于通信 ID，接收器会删除";
        map.appendChild(stuff);
        return;
      }
      const cell = document.createElement("button");
      cell.type = "button";
      const isIdBit = Number.isInteger(item.idBit);
      cell.className = `id-bit${isIdBit ? "" : " protocol"}${item.idBit === 18 ? " group-end" : ""}`;
      cell.innerHTML = `<span class="bit-name">${isIdBit ? `ID${item.idBit}` : item.field}</span><strong class="bit-value">${item.bit}</strong><span class="wire-index">wire ${wireIndex}</span>`;
      cell.title = isIdBit ? `ID${item.idBit} = ${item.bit}，在线上波形 bit ${wireIndex}` : `${item.field} 协议位，不属于 ID 数值`;
      cell.addEventListener("click", () => locateWireBit(wireIndex, `${isIdBit ? `ID${item.idBit}` : item.field} = ${item.bit} · wire ${wireIndex}`));
      map.appendChild(cell);
    });
  }

  function renderFieldGuide(frame, inputs) {
    const guide = document.getElementById("fieldGuide");
    const order = [];
    frame.wire.forEach((item, index) => {
      if (!order.some((entry) => entry.name === item.field)) order.push({ name: item.field, start: index, end: index });
      else order.find((entry) => entry.name === item.field).end = index;
    });
    const rawByField = new Map();
    frame.encodedFields.forEach((item) => {
      if (!rawByField.has(item.field)) rawByField.set(item.field, []);
      rawByField.get(item.field).push(item.bit);
    });
    const fieldValue = (name, rawBits) => {
      if (name === "ID") return `0x${inputs.id.toString(16).toUpperCase().padStart(3, "0")}`;
      if (name === "ID-A") return `0x${Math.floor(inputs.id / 2 ** 18).toString(16).toUpperCase().padStart(3, "0")}（ID28…ID18）`;
      if (name === "ID-B") return `0x${(inputs.id % 2 ** 18).toString(16).toUpperCase().padStart(5, "0")}（ID17…ID0）`;
      if (name.startsWith("DATA")) return `0x${inputs.data[Number(name.slice(4))].toString(16).toUpperCase().padStart(2, "0")}`;
      if (name === "CRC") return `0x${frame.checksum.toString(16).toUpperCase().padStart(4, "0")}`;
      return rawBits ? rawBits.join("") : (name === "ACK" ? "0（接收节点应答）" : "固定值");
    };
    guide.replaceChildren();
    order.forEach((entry) => {
      const rawBits = rawByField.get(entry.name);
      const card = document.createElement("article");
      card.className = "field-card";
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", `定位到 ${entry.name} 字段`);
      const color = colors[frame.wire[entry.start].group] || "#889";
      const rawLength = rawBits ? rawBits.length : entry.end - entry.start + 1;
      const stuffed = frame.wire.slice(entry.start, entry.end + 1).filter((item) => item.stuff).length;
      card.innerHTML = `<span class="field-color" style="background:${color}"></span><div><div class="field-card-head"><strong>${entry.name}</strong><code>bit ${entry.start}-${entry.end}</code></div><span class="field-value">${fieldValue(entry.name, rawBits)}</span><p>${descriptions[entry.name] || "CAN 帧字段"} ${stuffed ? `含 ${stuffed} 个填充位；原始字段 ${rawLength} bit。` : `${rawLength} bit。`}</p></div>`;
      const locateField = () => locateWireBit(entry.start, `${entry.name} · wire ${entry.start}`);
      card.addEventListener("click", locateField);
      card.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); locateField(); } });
      guide.appendChild(card);
    });
    document.getElementById("readingSummary").textContent = `${order.length} 个字段 · ${frame.wire.length} 个线上位 · 黄色区域为填充位`;
  }

  function render() {
    const error = document.getElementById("errorMessage");
    try {
      state.highlightedBit = null;
      state.highlightedLabel = "";
      const inputs = parseInputs();
      const frame = buildFrame(inputs);
      const stuffCount = frame.wire.filter((item) => item.stuff).length;
      const durationUs = frame.wire.length / inputs.bitrate * 1000000;
      document.getElementById("summaryType").textContent = inputs.frameType === "standard" ? "标准数据帧" : "扩展数据帧";
      document.getElementById("totalBits").textContent = `${frame.wire.length} bit`;
      document.getElementById("stuffBits").textContent = `${stuffCount} bit`;
      document.getElementById("frameDuration").textContent = durationUs >= 1000 ? `${(durationUs / 1000).toFixed(3)} ms` : `${durationUs.toFixed(1)} µs`;
      document.getElementById("crcValue").textContent = `0x${frame.checksum.toString(16).toUpperCase().padStart(4, "0")}`;
      document.getElementById("rawBits").textContent = groupBits(frame.crcInput);
      document.getElementById("wireBits").textContent = groupBits(frame.wire);
      renderIdMap(frame, inputs);
      renderFieldGuide(frame, inputs);
      error.textContent = "";
      drawWaveform(frame.wire, inputs.bitrate);
    } catch (caught) { error.textContent = caught.message; }
  }

  function normalizeHex(input, width) {
    const cleaned = input.value.toUpperCase().replace(/[^0-9A-F]/g, "").slice(0, width);
    input.value = cleaned;
  }

  document.querySelectorAll('input[name="frameType"]').forEach((input) => input.addEventListener("change", () => {
    const extended = input.value === "extended" && input.checked;
    if (extended) {
      document.getElementById("canId").maxLength = 8;
      document.getElementById("idRange").textContent = "范围 00000000–1FFFFFFF";
    } else if (input.checked) {
      document.getElementById("canId").maxLength = 3;
      document.getElementById("canId").value = document.getElementById("canId").value.slice(-3) || "000";
      document.getElementById("idRange").textContent = "范围 000–7FF";
    }
    render();
  }));
  document.getElementById("bitrate").addEventListener("change", render);
  document.getElementById("canId").addEventListener("input", (event) => { normalizeHex(event.target, document.getElementById("extendedFrame").checked ? 8 : 3); render(); });
  document.querySelectorAll(".byte-field input").forEach((input) => input.addEventListener("input", (event) => { normalizeHex(event.target, 2); render(); }));
  document.querySelectorAll(".byte-field input").forEach((input) => input.addEventListener("blur", () => { input.value = input.value.padStart(2, "0"); render(); }));
  document.getElementById("zoomOut").addEventListener("click", () => { state.bitWidth = Math.max(8, state.bitWidth - 2); document.getElementById("zoomValue").textContent = `${state.bitWidth} px`; render(); });
  document.getElementById("zoomIn").addEventListener("click", () => { state.bitWidth = Math.min(40, state.bitWidth + 2); document.getElementById("zoomValue").textContent = `${state.bitWidth} px`; render(); });
  render();
})();
