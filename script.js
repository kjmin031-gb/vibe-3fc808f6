/*
  ============================================================
  서울 버스 API 연결 설정

  1) endpoint에 준비한 API 주소를 넣으세요.
  2) API 주소에서 일련번호가 들어갈 자리에 {id}를 작성하세요.
     예시:
     "https://api.example.com/bus/arrival?arsId={id}&serviceKey=내키"

  3) API 키를 헤더에 넣어야 한다면 headers에 작성하세요.
     예시:
     headers: { Authorization: "Bearer 여기에_API_KEY" }

  API를 연결하지 않은 현재 상태에서는 예시 도착정보가 표시됩니다.
  ============================================================
*/
const API_CONFIG = {
  endpoint: "",
  headers: {
    // Authorization: "Bearer 여기에_API_KEY를_입력하세요",
  },
};

const form = document.getElementById("arrivalForm");
const serialInput = document.getElementById("serialNumber");
const serialLabel = document.getElementById("serialLabel");
const inputGuide = document.getElementById("inputGuide");
const searchButton = document.getElementById("searchButton");
const statusArea = document.getElementById("statusArea");
const resultSection = document.getElementById("resultSection");
const arrivalList = document.getElementById("arrivalList");
const locationName = document.getElementById("locationName");
const locationDetail = document.getElementById("locationDetail");
const updatedTime = document.getElementById("updatedTime");
const refreshButton = document.getElementById("refreshButton");
const typeOptions = document.querySelectorAll(".type-option");

let currentSearchType = "station";
let lastSerialNumber = "";

/* 검색 기준 전환 */
typeOptions.forEach((option) => {
  option.addEventListener("click", () => {
    const radio = option.querySelector("input");
    currentSearchType = radio.value;

    typeOptions.forEach((item) => item.classList.remove("active"));
    option.classList.add("active");

    if (currentSearchType === "station") {
      serialLabel.textContent = "정류장 일련번호(ARS ID)";
      serialInput.placeholder = "예: 02284";
      inputGuide.textContent = "버스정류장 표지판에 적힌 5자리 ARS ID를 입력하세요.";
    } else {
      serialLabel.textContent = "버스 노선 일련번호";
      serialInput.placeholder = "예: 100100118";
      inputGuide.textContent = "사용 중인 API에서 제공하는 버스 노선 일련번호를 입력하세요.";
    }

    serialInput.value = "";
    serialInput.focus();
    resultSection.classList.add("hidden");
    clearStatus();
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const serialNumber = serialInput.value.trim();

  if (!serialNumber) {
    showStatus("error", "일련번호를 입력한 뒤 조회해주세요.");
    serialInput.focus();
    return;
  }

  lastSerialNumber = serialNumber;
  await searchArrivalInfo(serialNumber);
});

refreshButton.addEventListener("click", () => {
  if (lastSerialNumber) {
    searchArrivalInfo(lastSerialNumber);
  }
});

async function searchArrivalInfo(serialNumber) {
  setLoading(true);
  resultSection.classList.add("hidden");
  showStatus("loading", "서울 버스 도착정보를 불러오는 중입니다...");

  try {
    let data;

    if (API_CONFIG.endpoint.trim()) {
      data = await requestBusAPI(serialNumber);
    } else {
      // API 주소를 넣기 전, 화면 확인을 위한 예시 데이터입니다.
      await wait(700);
      data = createDemoData(serialNumber);
    }

    renderArrivalInfo(data, serialNumber);
    clearStatus();
    resultSection.classList.remove("hidden");
  } catch (error) {
    console.error(error);
    showStatus(
      "error",
      "도착정보를 불러오지 못했습니다. API 주소, 인증 키, 일련번호를 다시 확인해주세요."
    );
  } finally {
    setLoading(false);
  }
}

/* 실제 API 요청 */
async function requestBusAPI(serialNumber) {
  const url = API_CONFIG.endpoint.replace("{id}", encodeURIComponent(serialNumber));

  const response = await fetch(url, {
    method: "GET",
    headers: API_CONFIG.headers,
  });

  if (!response.ok) {
    throw new Error(`API 요청 실패: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  let rawData;

  if (contentType.includes("json")) {
    rawData = await response.json();
  } else {
    const xmlText = await response.text();
    rawData = parseXmlToBusData(xmlText);
  }

  return normalizeApiData(rawData, serialNumber);
}

/*
  준비한 API의 응답 형식이 아래 예시와 다르다면
  normalizeApiData 함수 안에서 데이터 이름만 맞춰 수정하면 됩니다.

  화면이 사용하는 최종 데이터 형식:
  {
    locationName: "정류장 이름",
    locationDetail: "ARS ID · 방향",
    arrivals: [
      {
        busNumber: "271",
        routeName: "면목동차고지 ↔ 상암동",
        arrivalText: "3분 후",
        stopsAway: "2번째 전",
        color: "blue"
      }
    ]
  }
*/
function normalizeApiData(apiData, serialNumber) {
  // 이미 화면용 형식으로 준비된 데이터를 API가 준 경우
  if (apiData.arrivals && Array.isArray(apiData.arrivals)) {
    return apiData;
  }

  // 서울시 버스 API에서 흔히 사용하는 msgBody/itemList 형식 대응
  const body = apiData.msgBody || apiData.response?.body || apiData.body || apiData;
  const itemList = body.itemList || body.items || body.arrivals || [];
  const items = Array.isArray(itemList) ? itemList : [itemList];

  if (!items.length) {
    throw new Error("도착정보가 없습니다.");
  }

  return {
    locationName:
      body.stNm ||
      body.stationName ||
      apiData.stationName ||
      `${serialNumber} 정류장`,
    locationDetail: `일련번호 ${serialNumber}`,
    arrivals: items.map((item) => {
      const firstArrival = item.arrmsg1 || item.arrivalMessage || item.arrivalText || "도착정보 없음";
      const secondArrival = item.arrmsg2 || item.secondArrivalMessage || "";
      const busNumber = item.rtNm || item.busNumber || item.routeName || "버스";
      const routeName = item.adirection || item.routeDescription || "운행 정보";
      const color = getBusColor(item.routeType || item.busType);

      return {
        busNumber: String(busNumber),
        routeName,
        arrivalText: firstArrival,
        stopsAway: secondArrival,
        color,
      };
    }),
  };
}

/* XML로 응답하는 API를 위한 간단한 변환 함수 */
function parseXmlToBusData(xmlText) {
  const xml = new DOMParser().parseFromString(xmlText, "text/xml");
  const parserError = xml.querySelector("parsererror");

  if (parserError) {
    throw new Error("API 응답을 해석할 수 없습니다.");
  }

  const getText = (parent, tagName) => parent.querySelector(tagName)?.textContent?.trim() || "";
  const itemNodes = [...xml.querySelectorAll("itemList, item")];

  return {
    msgBody: {
      stNm: getText(xml, "stNm"),
      itemList: itemNodes.map((node) => ({
        rtNm: getText(node, "rtNm"),
        adirection: getText(node, "adirection"),
        arrmsg1: getText(node, "arrmsg1"),
        arrmsg2: getText(node, "arrmsg2"),
        routeType: getText(node, "routeType"),
      })),
    },
  };
}

function renderArrivalInfo(data, serialNumber) {
  locationName.textContent =
    data.locationName ||
    (currentSearchType === "station" ? "정류장 도착정보" : "버스 노선 도착정보");

  locationDetail.textContent =
    data.locationDetail ||
    `${currentSearchType === "station" ? "정류장" : "노선"} 일련번호 ${serialNumber}`;

  arrivalList.innerHTML = "";

  if (!data.arrivals || data.arrivals.length === 0) {
    arrivalList.innerHTML = `
      <div class="arrival-item">
        <div class="bus-number">-</div>
        <div class="bus-info">
          <strong>도착 예정 버스가 없습니다.</strong>
          <span>잠시 후 다시 조회해주세요.</span>
        </div>
      </div>
    `;
  } else {
    data.arrivals.forEach((arrival) => {
      const item = document.createElement("article");
      item.className = "arrival-item";

      item.innerHTML = `
        <div class="bus-number ${escapeHtml(arrival.color || "")}">
          ${escapeHtml(arrival.busNumber || "버스")}
        </div>
        <div class="bus-info">
          <strong>${escapeHtml(arrival.routeName || "운행 정보")}</strong>
          <span>${escapeHtml(arrival.stopsAway || "도착 예정")}</span>
        </div>
        <div class="arrival-time">
          ${escapeHtml(arrival.arrivalText || "정보 없음")}
          <small>첫 번째 버스</small>
        </div>
      `;

      arrivalList.appendChild(item);
    });
  }

  updatedTime.textContent = new Date().toLocaleString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function createDemoData(serialNumber) {
  const stationNames = ["강남역", "서울역", "광화문", "홍대입구역", "잠실역"];
  const stationName = stationNames[Number(serialNumber.slice(-1)) % stationNames.length];

  if (currentSearchType === "bus") {
    return {
      locationName: `${serialNumber}번 버스 도착정보`,
      locationDetail: `버스 노선 일련번호 ${serialNumber}`,
      arrivals: [
        {
          busNumber: serialNumber,
          routeName: "현재 운행 중인 버스",
          arrivalText: "3분 후",
          stopsAway: "2번째 전 정류장",
          color: "blue",
        },
        {
          busNumber: serialNumber,
          routeName: "현재 운행 중인 버스",
          arrivalText: "12분 후",
          stopsAway: "7번째 전 정류장",
          color: "blue",
        },
      ],
    };
  }

  return {
    locationName: `${stationName} 정류장`,
    locationDetail: `ARS ID ${serialNumber} · 서울특별시`,
    arrivals: [
      {
        busNumber: "271",
        routeName: "면목동차고지 방면",
        arrivalText: "3분 후",
        stopsAway: "2번째 전 정류장",
        color: "blue",
      },
      {
        busNumber: "7016",
        routeName: "상암동 방면",
        arrivalText: "7분 후",
        stopsAway: "4번째 전 정류장",
        color: "green",
      },
      {
        busNumber: "9401",
        routeName: "분당 방면",
        arrivalText: "12분 후",
        stopsAway: "8번째 전 정류장",
        color: "orange",
      },
    ],
  };
}

function getBusColor(routeType) {
  const type = String(routeType);

  if (["2", "6"].includes(type)) return "green";
  if (["3", "4"].includes(type)) return "orange";
  return "blue";
}

function setLoading(isLoading) {
  searchButton.disabled = isLoading;
  searchButton.innerHTML = isLoading
    ? `<span class="spinner"></span><span>조회 중</span>`
    : `<span>도착정보 조회</span><span class="arrow">→</span>`;
}

function showStatus(type, message) {
  const icon = type === "loading" ? '<span class="spinner"></span>' : "<span>⚠</span>";
  statusArea.innerHTML = `<div class="status-message ${type}">${icon}<span>${message}</span></div>`;
}

function clearStatus() {
  statusArea.innerHTML = "";
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = value;
  return element.innerHTML;
}