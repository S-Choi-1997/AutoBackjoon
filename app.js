// API URL 설정 (Cloud Run의 URL로 바꿔주세요)
const API_URL = 'https://your-backend-url.run.app';

// DOM 요소 가져오기
document.addEventListener('DOMContentLoaded', function() {
  // 기본 UI 요소
  const problemForm = document.getElementById('problemForm');
  const loadingElem = document.getElementById('loading');
  const resultContainer = document.getElementById('resultContainer');
  const resultTitle = document.getElementById('resultTitle');
  const codeResult = document.getElementById('codeResult');
  const codeResultWrapper = document.getElementById('codeResultWrapper');
  const emptyResult = document.getElementById('emptyResult');
  const sourcesList = document.getElementById('sourcesList');
  const errorContainer = document.getElementById('errorContainer');
  const errorMessage = document.getElementById('errorMessage');
  const copyBtn = document.getElementById('copyBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  
  // 큐 관련 DOM 요소
  const addToQueueForm = document.getElementById('addToQueueForm');
  const queueProblemId = document.getElementById('queueProblemId');
  const problemQueue = document.getElementById('problemQueue');
  const queueCount = document.getElementById('queueCount');
  const executeOneBtn = document.getElementById('executeOneBtn');
  
  // 문제 큐 배열
  let problemsQueue = [];
  
  // 폼 제출 이벤트 처리
  problemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const problemId = document.getElementById('problemId').value.trim();
    if (!problemId) {
      showError('문제 번호를 입력해주세요.');
      return;
    }
    
    if (!/^\d+$/.test(problemId)) {
      showError('문제 번호는 숫자만 입력해주세요.');
      return;
    }
    
    await generateCode(problemId);
  });
  
  // 코드 생성 함수
  async function generateCode(problemId) {
    // 로딩 표시
    loadingElem.classList.remove('hidden');
    emptyResult.classList.add('hidden');
    codeResultWrapper.classList.add('hidden');
    errorContainer.classList.add('hidden');
    
    try {
      // API 호출
      const response = await fetch(`${API_URL}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ problem_id: problemId })
      });
      
      const data = await response.json();
      
      if (data.error) {
        showError(data.error);
        // 큐에서 해당 문제가 있으면 상태 업데이트
        updateQueueItemStatus(problemId, 'failed');
        return;
      }
      
      // 결과 표시
      resultTitle.textContent = `백준 ${data.problem_id}번 문제 해결 코드`;
      codeResult.textContent = data.code;
      
      // 빈 결과 숨기고 코드 표시
      emptyResult.classList.add('hidden');
      codeResultWrapper.classList.remove('hidden');
      
      // 코드 하이라이팅 적용
      hljs.highlightElement(codeResult);
      
      // 참고 자료 표시
      sourcesList.innerHTML = '';
      if (data.sources && data.sources.length > 0) {
        data.sources.forEach((link, idx) => {
          const host = new URL(link).hostname;
          const li = document.createElement('li');
          li.innerHTML = `${idx + 1}. <a href="${link}" target="_blank" class="text-blue-500 hover:underline">${host}</a>`;
          sourcesList.appendChild(li);
        });
      } else {
        sourcesList.innerHTML = '<li class="text-gray-500">참고 자료가 없습니다.</li>';
      }
      
      // 큐에서 해당 문제가 있으면 상태 업데이트
      updateQueueItemStatus(problemId, 'completed');
    } catch (err) {
      showError('API 요청 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      console.error(err);
      // 큐에서 해당 문제가 있으면 상태 업데이트
      updateQueueItemStatus(problemId, 'failed');
    } finally {
      loadingElem.classList.add('hidden');
    }
  }
  
  // 큐에 문제 추가
  addToQueueForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const problemId = queueProblemId.value.trim();
    if (!problemId) {
      alert('문제 번호를 입력해주세요.');
      return;
    }
    
    if (!/^\d+$/.test(problemId)) {
      alert('문제 번호는 숫자만 입력해주세요.');
      return;
    }
    
    // 이미 큐에 있는지 확인
    if (problemsQueue.some(item => item.id === problemId)) {
      alert('이미 큐에 있는 문제입니다.');
      return;
    }
    
    // 큐에 추가
    problemsQueue.push({
      id: problemId,
      status: 'waiting' // waiting, processing, completed, failed
    });
    
    // 큐 업데이트
    updateQueueDisplay();
    
    // 입력 필드 초기화
    queueProblemId.value = '';
  });
  
  // 하나의 문제만 처리
  executeOneBtn.addEventListener('click', async () => {
    if (problemsQueue.length === 0) {
      alert('큐에 처리할 문제가 없습니다.');
      return;
    }
    
    // 대기 중인 문제만 필터링
    const waitingProblems = problemsQueue.filter(item => item.status === 'waiting');
    
    if (waitingProblems.length === 0) {
      alert('대기 중인 문제가 없습니다.');
      return;
    }
    
    // 첫 번째 대기 중인 문제만 처리
    const problem = waitingProblems[0];
    problem.status = 'processing';
    updateQueueDisplay();
    
    // 문제 번호를 검색 입력란에도 표시
    document.getElementById('problemId').value = problem.id;
    
    // 코드 생성 (상태 업데이트는 generateCode 함수 내에서 처리)
    await generateCode(problem.id);
  });
  
  // 큐 표시 업데이트
  function updateQueueDisplay() {
    // 카운트 업데이트
    queueCount.textContent = problemsQueue.length;
    
    // 큐가 비어있으면
    if (problemsQueue.length === 0) {
      problemQueue.innerHTML = `
        <tr class="text-gray-500 italic">
          <td class="px-4 py-2" colspan="3">큐에 문제가 없습니다.</td>
        </tr>
      `;
      return;
    }
    
    // 큐 목록 업데이트
    problemQueue.innerHTML = '';
    problemsQueue.forEach(problem => {
      const tr = document.createElement('tr');
      tr.className = 'border-t border-gray-200 dark:border-gray-700';
      
      // 상태에 따른 배지 스타일
      let statusBadge = '';
      switch(problem.status) {
        case 'waiting':
          statusBadge = '<span class="px-2 py-1 text-xs rounded-full bg-gray-200 text-gray-800">대기 중</span>';
          break;
        case 'processing':
          statusBadge = '<span class="px-2 py-1 text-xs rounded-full bg-blue-200 text-blue-800">처리 중</span>';
          break;
        case 'completed':
          statusBadge = '<span class="px-2 py-1 text-xs rounded-full bg-green-200 text-green-800">완료</span>';
          break;
        case 'failed':
          statusBadge = '<span class="px-2 py-1 text-xs rounded-full bg-red-200 text-red-800">실패</span>';
          break;
      }
      
      tr.innerHTML = `
        <td class="px-4 py-2">${problem.id}</td>
        <td class="px-4 py-2">${statusBadge}</td>
        <td class="px-4 py-2">
          <button class="text-red-500 hover:text-red-700 remove-btn" data-id="${problem.id}">
            삭제
          </button>
        </td>
      `;
      
      problemQueue.appendChild(tr);
    });
    
    // 삭제 버튼 이벤트 추가
    document.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const problemId = this.getAttribute('data-id');
        removeFromQueue(problemId);
      });
    });
  }
  
  // 큐에서 제거
  function removeFromQueue(problemId) {
    problemsQueue = problemsQueue.filter(item => item.id !== problemId);
    updateQueueDisplay();
  }
  
  // 큐 아이템 상태 업데이트
  function updateQueueItemStatus(problemId, status) {
    const item = problemsQueue.find(item => item.id === problemId);
    if (item) {
      item.status = status;
      updateQueueDisplay();
    }
  }
  
  // 복사 버튼 기능
  copyBtn.addEventListener('click', () => {
    // 코드가 있는지 확인
    if (codeResult.textContent.trim() === '') {
      alert('복사할 코드가 없습니다.');
      return;
    }
    
    navigator.clipboard.writeText(codeResult.textContent)
      .then(() => {
        copyBtn.textContent = '복사됨!';
        setTimeout(() => {
          copyBtn.textContent = '복사하기';
        }, 2000);
      })
      .catch(err => {
        console.error('복사 실패:', err);
      });
  });
  
  // 다운로드 버튼 기능
  downloadBtn.addEventListener('click', () => {
    // 코드가 있는지 확인
    if (codeResult.textContent.trim() === '') {
      alert('다운로드할 코드가 없습니다.');
      return;
    }
    
    const problemId = document.getElementById('problemId').value.trim();
    const blob = new Blob([codeResult.textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BOJ_${problemId}.java`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
  
  // 오류 표시 함수
  function showError(message) {
    errorMessage.textContent = message;
    errorContainer.classList.remove('hidden');
    loadingElem.classList.add('hidden');
  }
  
  // 초기화
  updateQueueDisplay();
});