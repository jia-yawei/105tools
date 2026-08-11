const mcuData = {
    'STM32F103': {
        pllType: 'multiplier',
        maxSysclk: 72,
        maxAhb: 72,
        maxApb1: 36,
        maxApb2: 72,
        buses: {
            AHB: ['DMA1', 'DMA2', 'SRAM', 'FLITF', 'CRC', 'FSMC', 'SDIO'],
            APB2: ['AFIO', 'EXTI', 'GPIOA', 'GPIOB', 'GPIOC', 'GPIOD', 'GPIOE', 'GPIOF', 'GPIOG', 'ADC1', 'ADC2', 'TIM1', 'SPI1', 'TIM8', 'USART1', 'ADC3', 'TIM9', 'TIM10', 'TIM11'],
            APB1: ['TIM2', 'TIM3', 'TIM4', 'TIM5', 'TIM6', 'TIM7', 'TIM12', 'TIM13', 'TIM14', 'WWDG', 'SPI2', 'SPI3', 'USART2', 'USART3', 'UART4', 'UART5', 'I2C1', 'I2C2', 'USB', 'CAN', 'BKP', 'PWR', 'DAC']
        }
    },
    'GD32F405': {
        pllType: 'mnpq',
        maxSysclk: 168,
        maxAhb: 168,
        maxApb1: 42,
        maxApb2: 84,
        buses: {
            AHB1: ['GPIOA', 'GPIOB', 'GPIOC', 'GPIOD', 'GPIOE', 'GPIOF', 'GPIOG', 'GPIOH', 'GPIOI', 'CRC', 'BKPSRAM', 'CCMDATARAM', 'DMA0', 'DMA1', 'ENET', 'USBHS'],
            AHB2: ['DCI', 'TRNG', 'USBFS'],
            AHB3: ['EXMC'],
            APB2: ['TIMER0', 'TIMER7', 'USART0', 'USART5', 'ADC0', 'ADC1', 'ADC2', 'SDIO', 'SPI0', 'SPI3', 'SYSCFG', 'TIMER8', 'TIMER9', 'TIMER10'],
            APB1: ['TIMER1', 'TIMER2', 'TIMER3', 'TIMER4', 'TIMER5', 'TIMER6', 'TIMER11', 'TIMER12', 'TIMER13', 'RTC', 'WWDG', 'SPI1', 'SPI2', 'USART1', 'USART2', 'UART3', 'UART4', 'I2C0', 'I2C1', 'I2C2', 'CAN0', 'CAN1', 'PMU', 'DAC']
        }
    }
};

// DOM Elements
const mcuSelect = document.getElementById('mcu-select');
const srcRadios = document.getElementsByName('clock-src');
const hseFreqInput = document.getElementById('hse-freq');
const hseInputWrapper = document.getElementById('hse-input-wrapper');
const pllDynamicControls = document.getElementById('pll-dynamic-controls');

const ahbPre = document.getElementById('ahb-pre');
const apb1Pre = document.getElementById('apb1-pre');
const apb2Pre = document.getElementById('apb2-pre');

const ahbText = document.getElementById('ahb-text');
const apb1Text = document.getElementById('apb1-text');
const apb2Text = document.getElementById('apb2-text');

const outSysclk = document.getElementById('out-sysclk');
const outHclk = document.getElementById('out-hclk');
const warnSysclk = document.getElementById('warn-sysclk');
const warnHclk = document.getElementById('warn-hclk');
const maxSysclkSpan = document.getElementById('max-sysclk');
const maxAhbSpan = document.getElementById('max-ahb');

const badgeHclk = document.getElementById('badge-hclk');
const badgePclk1 = document.getElementById('badge-pclk1');
const badgeTim1 = document.getElementById('badge-tim1');
const badgePclk2 = document.getElementById('badge-pclk2');
const badgeTim2 = document.getElementById('badge-tim2');

const warnApb1 = document.getElementById('warn-apb1');
const warnApb2 = document.getElementById('warn-apb2');
const maxApb1Span = document.getElementById('max-apb1');
const maxApb2Span = document.getElementById('max-apb2');

const listAhb = document.getElementById('list-ahb');
const listApb1 = document.getElementById('list-apb1');
const listApb2 = document.getElementById('list-apb2');

// State
let currentMcu = 'GD32F405';
let currentSrc = 'HSE'; 
let inputFreq = 8; 

function init() {
    buildPllControls();
    updateInputFreq();
    attachEventListeners();
    calculateAndRender();
}

// Convert Hex input to integer safely
function parseHex(val) {
    if(typeof val === 'string' && val.trim().startsWith('0x')) {
        return parseInt(val, 16);
    }
    return parseInt(val, 10);
}

// Register decoding helpers
function decodeAhbPrescaler(val) {
    let code = parseHex(val);
    if(isNaN(code)) return 1;
    if(code < 0x08) return 1;
    switch(code) {
        case 0x08: return 2;
        case 0x09: return 4;
        case 0x0A: return 8;
        case 0x0B: return 16;
        case 0x0C: return 64;
        case 0x0D: return 128;
        case 0x0E: return 256;
        case 0x0F: return 512;
        default: return 1;
    }
}

function decodeApbPrescaler(val) {
    let code = parseHex(val);
    if(isNaN(code)) return 1;
    if(code < 0x04) return 1;
    switch(code) {
        case 0x04: return 2;
        case 0x05: return 4;
        case 0x06: return 8;
        case 0x07: return 16;
        default: return 1;
    }
}

function decodePllP(val) {
    let code = parseHex(val);
    if(isNaN(code)) return 2;
    switch(code) {
        case 0x00: return 2;
        case 0x01: return 4;
        case 0x02: return 6;
        case 0x03: return 8;
        default: return 2;
    }
}

function buildPllControls() {
    const data = mcuData[currentMcu];
    pllDynamicControls.innerHTML = ''; 

    if (data.pllType === 'multiplier') {
        // STM32F103 Simplified
        const wrapper = document.createElement('div');
        wrapper.className = 'input-wrapper';
        wrapper.innerHTML = `
            <label for="pll-mul">PLLMUL</label>
            <input type="text" id="pll-mul" value="9" title="Decimal multiplier (e.g. 9)">
        `;
        pllDynamicControls.appendChild(wrapper);
    } else if (data.pllType === 'mnpq') {
        // GD32F405 / STM32F407
        const grid = document.createElement('div');
        grid.className = 'pll-grid';
        grid.innerHTML = `
            <div class="input-wrapper">
                <label for="pll-psc">PLLPSC (/M)</label>
                <input type="text" id="pll-psc" class="compact-input" value="0x08" title="Divider M. E.g. 0x08 = /8">
            </div>
            <div class="input-wrapper">
                <label for="pll-n">PLLN (*N)</label>
                <input type="text" id="pll-n" class="compact-input" value="0x0090" title="Multiplier N. E.g. 0x0090 = *144">
            </div>
            <div class="input-wrapper">
                <label for="pll-p">PLLP (/P)</label>
                <input type="text" id="pll-p" class="compact-input" value="0x00" title="0x00=/2, 0x01=/4, 0x02=/6, 0x03=/8">
            </div>
            <div class="input-wrapper">
                <label for="pll-q">PLLQ (/Q)</label>
                <input type="text" id="pll-q" class="compact-input" value="0x07" title="Divider Q (USB/SDIO)">
            </div>
        `;
        pllDynamicControls.appendChild(grid);
    }

    const inputs = pllDynamicControls.querySelectorAll('input');
    inputs.forEach(el => el.addEventListener('input', calculateAndRender));
}

function updateInputFreq() {
    if (currentSrc === 'HSE') {
        inputFreq = parseFloat(hseFreqInput.value) || 8;
        hseInputWrapper.style.opacity = '1';
        hseInputWrapper.style.pointerEvents = 'auto';
    } else {
        if (currentMcu === 'STM32F103') inputFreq = 8; // HSI
        else inputFreq = 16; // IRC16M
        hseInputWrapper.style.opacity = '0.4';
        hseInputWrapper.style.pointerEvents = 'none';
    }
}

function attachEventListeners() {
    mcuSelect.addEventListener('change', (e) => {
        currentMcu = e.target.value;
        buildPllControls();
        updateInputFreq();
        calculateAndRender();
    });

    srcRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            currentSrc = e.target.value;
            updateInputFreq();
            calculateAndRender();
        });
    });

    hseFreqInput.addEventListener('change', () => {
        updateInputFreq();
        calculateAndRender();
    });

    ahbPre.addEventListener('input', calculateAndRender);
    apb1Pre.addEventListener('input', calculateAndRender);
    apb2Pre.addEventListener('input', calculateAndRender);
}

function calculateAndRender() {
    const data = mcuData[currentMcu];
    let sysclk = 0;
    let formulaHtml = '';

    // 1. Calc SYSCLK
    if (data.pllType === 'multiplier') {
        let mul = parseHex(document.getElementById('pll-mul').value) || 9;
        const baseFreq = currentSrc === 'HSI' ? inputFreq / 2 : inputFreq;
        sysclk = baseFreq * mul;
        
        const srcName = currentSrc === 'HSI' ? '(IRC8M / 2)' : 'HXTAL';
        formulaHtml = `SYSCLK = ${srcName} × PLLMUL<br>SYSCLK = ${baseFreq} × ${mul} = <span style="color:var(--text-primary);font-weight:bold;">${sysclk.toFixed(2)} MHz</span>`;
    } else if (data.pllType === 'mnpq') {
        let pllpsc = parseHex(document.getElementById('pll-psc').value) || 8;
        let plln = parseHex(document.getElementById('pll-n').value) || 144;
        let pllp = decodePllP(document.getElementById('pll-p').value);
        
        const vco = (inputFreq / pllpsc) * plln;
        sysclk = vco / pllp;
        
        const srcName = currentSrc === 'HSI' ? 'IRC16M' : 'HXTAL';
        formulaHtml = `SYSCLK = (${srcName} / PLLPSC) × PLLN / PLLP<br>SYSCLK = (${inputFreq} / ${pllpsc}) × ${plln} / ${pllp} = <span style="color:var(--text-primary);font-weight:bold;">${sysclk.toFixed(2)} MHz</span>`;
    }
    
    document.getElementById('pll-formula-box').innerHTML = formulaHtml;

    // 2. Calc Buses
    const ahbDiv = decodeAhbPrescaler(ahbPre.value);
    const apb1Div = decodeApbPrescaler(apb1Pre.value);
    const apb2Div = decodeApbPrescaler(apb2Pre.value);

    // Update hints
    ahbText.textContent = `/${ahbDiv}`;
    apb1Text.textContent = `/${apb1Div}`;
    apb2Text.textContent = `/${apb2Div}`;

    const hclk = sysclk / ahbDiv;
    const pclk1 = hclk / apb1Div;
    const pclk2 = hclk / apb2Div;

    const tim1Clk = apb1Div === 1 ? pclk1 : pclk1 * 2;
    const tim2Clk = apb2Div === 1 ? pclk2 : pclk2 * 2;

    // 3. Render Values
    outSysclk.textContent = sysclk.toFixed(2);
    outHclk.textContent = hclk.toFixed(2);
    badgeHclk.textContent = hclk.toFixed(2) + ' MHz';
    badgePclk1.textContent = pclk1.toFixed(2) + ' MHz';
    badgeTim1.textContent = '定时器: ' + tim1Clk.toFixed(2) + ' MHz';
    badgePclk2.textContent = pclk2.toFixed(2) + ' MHz';
    badgeTim2.textContent = '定时器: ' + tim2Clk.toFixed(2) + ' MHz';

    // 4. Check limits
    checkLimit(sysclk, data.maxSysclk, warnSysclk, maxSysclkSpan, document.querySelector('.sysclk-card'));
    checkLimit(hclk, data.maxAhb, warnHclk, maxAhbSpan, document.querySelector('.hclk-card'));
    checkLimit(pclk1, data.maxApb1, warnApb1, maxApb1Span, document.getElementById('domain-apb1'));
    checkLimit(pclk2, data.maxApb2, warnApb2, maxApb2Span, document.getElementById('domain-apb2'));

    // 5. Render periphs
    renderPeripherals(listAhb, data.buses.AHB || [...(data.buses.AHB1||[]), ...(data.buses.AHB2||[]), ...(data.buses.AHB3||[])]);
    renderPeripherals(listApb1, data.buses.APB1);
    renderPeripherals(listApb2, data.buses.APB2);
    
    // 6. Update Calculators
    updatePeripheralCalcs(pclk1, pclk2);
}

function updatePeripheralCalcs(pclk1, pclk2) {
    // 1. SPI
    let spiBus = document.getElementById('spi-bus').value === 'apb1' ? pclk1 : pclk2;
    let spiBr = parseFloat(document.getElementById('spi-br').value);
    let spiBaud = spiBus / spiBr;
    document.getElementById('spi-res').innerHTML = `实际波特率: <span style="color:var(--accent-cyan)">${spiBaud.toFixed(3)} MHz</span>`;
    document.getElementById('spi-form').innerHTML = `Baud = PCLK / Prescaler<br>Baud = ${spiBus.toFixed(2)} / ${spiBr}`;



    // 3. CAN
    let canBus = pclk1; // APB1 fixed
    let canBrp = parseFloat(document.getElementById('can-brp').value) || 4;
    let canBs1 = parseFloat(document.getElementById('can-bs1').value) || 8;
    let canBs2 = parseFloat(document.getElementById('can-bs2').value) || 5;
    
    let totalTq = 1 + canBs1 + canBs2;
    let canBaud = (canBus * 1000000) / (canBrp * totalTq);
    let samplePoint = ((1 + canBs1) / totalTq) * 100;

    document.getElementById('can-res').innerHTML = `
        波特率: <span style="color:var(--accent-cyan)">${(canBaud/1000).toFixed(1)} kbps</span> 
        <span style="margin: 0 8px; opacity:0.3;">|</span> 
        采样点: <span style="color:var(--accent-indigo)">${samplePoint.toFixed(2)}%</span>
    `;
    document.getElementById('can-form').innerHTML = `
        Baud = PCLK1 / (Prescaler × (1 + BS1 + BS2)) = ${canBus.toFixed(2)}MHz / (${canBrp} × ${totalTq})<br>
        采样点 = (1 + BS1) / (1 + BS1 + BS2) = (1 + ${canBs1}) / ${totalTq} = ${samplePoint.toFixed(2)}%
    `;


}

document.querySelectorAll('.calc-row select, .calc-row input, .inline-inputs select, .inline-inputs input, .calc-inputs select, .calc-inputs input').forEach(el => {
    el.addEventListener('input', calculateAndRender);
    el.addEventListener('change', calculateAndRender);
});

function checkLimit(val, max, warnEl, maxSpanEl, cardEl) {
    maxSpanEl.textContent = max;
    if (val > max) {
        warnEl.classList.add('show');
        cardEl.classList.add('error');
    } else {
        warnEl.classList.remove('show');
        cardEl.classList.remove('error');
    }
}

function renderPeripherals(container, list) {
    if (!list) return;
    container.innerHTML = list.map(p => `<div class="peripheral-item">${p}</div>`).join('');
}

init();
