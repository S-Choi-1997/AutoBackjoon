// API URL 설정 (환경에 따라 자동 설정)
let API_URL;

// 백엔드 서버 URL 감지 (개발/운영환경 자동 전환)
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  // 로컬 개발 환경
  API_URL = 'http://localhost:8080';
} else {
  // 운영 환경 - Cloud Run URL (실제 배포 URL로 변경해야 함)
  API_URL = 'https://autobackjoon-day-28424568480.us-central1.run.app/';
}

console.log(`API 서버 URL: ${API_URL}`);

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
  const refreshQueueBtn = document.getElementById('refreshQueueBtn');
  const refreshStatus = document.getElementById('refreshStatus');
  const lastUpdatedTime = document.getElementById('lastUpdatedTime');
  
  // 문제 큐 배열
  let problemsQueue = [];
  let isLoadingQueue = false;
  
  // 페이지 로드 시 Firebase에서 문제 목록 가져오기
  loadProblemsFromFirebase();
  
  // 새로고침 버튼 이벤트 처리
  refreshQueueBtn.addEventListener('click', async () => {
    if (isLoadingQueue) return; // 이미 로딩 중이면 중복 요청 방지
    await loadProblemsFromFirebase(true); // 강제 새로고침
  });
  
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
      console.log(`API 요청: ${API_URL}/generate - 문제 ID: ${problemId}`);
      
      // API 호출
      const response = await fetch(`${API_URL}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ problem_id: problemId })
      });
      
      if (!response.ok) {
        console.error(`API 응답 오류: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        console.error(`응답 내용: ${errorText}`);
        throw new Error(`API 응답 오류: ${response.status}`);
      }
      
      const data = await response.json();
      console.log("API 응답 데이터:", data);
      
      if (data.error) {
        showError(data.error);
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
      
      // 문제 목록 새로고침
      await loadProblemsFromFirebase();
    } catch (err) {
      console.error('API 요청 상세 오류:', err);
      showError('API 요청 중 오류가 발생했습니다. 콘솔을 확인해 주세요.');
    } finally {
      loadingElem.classList.add('hidden');
    }
  }
  
  // Firebase에서 문제 목록 가져오기
  async function loadProblemsFromFirebase(forceRefresh = false) {
    if (isLoadingQueue && !forceRefresh) return; // 이미 로딩 중이고 강제 새로고침이 아니면 중복 요청 방지
    
    isLoadingQueue = true;
    refreshStatus.classList.remove('hidden');
    
    try {
      console.log('Firebase에서 문제 목록 가져오는 중...');
      const response = await fetch(`${API_URL}/list-problems`);
      
      if (!response.ok) {
        console.error(`문제 목록 가져오기 오류: ${response.status}`);
        refreshStatus.textContent = '큐 데이터 가져오기 실패';
        setTimeout(() => {
          refreshStatus.classList.add('hidden');
        }, 3000);
        return;
      }
      
      const data = await response.json();
      console.log('Firebase에서 가져온 문제 목록 원본:', data);
      
      if (data.problems && Array.isArray(data.problems)) {
        // Firebase 문제 목록 형식 변환 - 상태 매핑 부분 수정
        problemsQueue = data.problems.map(p => {
          // 원본 데이터 로깅
          console.log(`문제 ${p.id} 데이터:`, p.data);
          
          // 상태값 확인 (completed 여부 명확히 파악)
          const rawStatus = p.data.status || 'unknown';
          console.log(`문제 ${p.id} 원본 상태: ${rawStatus}`);
          
          // 프론트엔드에서 사용할 상태값으로 변환
          let status = rawStatus;
          if (rawStatus === 'pending') {
            status = 'waiting';
          }
          
          // completed 여부 명확히 저장
          const isCompleted = (rawStatus === 'completed');
          console.log(`문제 ${p.id} 변환된 상태: ${status}, 완료여부: ${isCompleted}`);
          
          return {
            id: p.id,
            status: status,
            isCompleted: isCompleted,  // 명시적으로 completed 여부 저장
            createdAt: p.data.created_at || new Date().toISOString()
          };
        });
        
        updateQueueDisplay();
        
        // 마지막 업데이트 시간 표시
        const now = new Date();
        lastUpdatedTime.textContent = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
        
        refreshStatus.textContent = '큐 데이터 새로고침 완료';
        setTimeout(() => {
          refreshStatus.classList.add('hidden');
        }, 1500);
      }
    } catch (err) {
      console.error('문제 목록 로드 중 오류:', err);
      refreshStatus.textContent = '큐 데이터 가져오기 실패';
      setTimeout(() => {
        refreshStatus.classList.add('hidden');
      }, 3000);
    } finally {
      isLoadingQueue = false;
    }
  }
  
  // 큐에 문제 추가
  addToQueueForm.addEventListener('submit', async (e) => {
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
    
    try {
      refreshStatus.textContent = '문제 추가 중...';
      refreshStatus.classList.remove('hidden');
      
      // Firebase에 문제 추가 요청
      const response = await fetch(`${API_URL}/add-problem`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ problem_id: problemId })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        alert(`문제 추가 실패: ${errorData.error || '알 수 없는 오류'}`);
        refreshStatus.classList.add('hidden');
        return;
      }
      
      const data = await response.json();
      console.log('Firebase에 문제 추가 결과:', data);
      
      // 문제 목록 새로고침
      await loadProblemsFromFirebase(true);
      
      // 입력 필드 초기화
      queueProblemId.value = '';
      
      refreshStatus.textContent = '문제가 성공적으로 추가되었습니다';
      setTimeout(() => {
        refreshStatus.classList.add('hidden');
      }, 1500);
    } catch (err) {
      console.error('문제 추가 중 오류:', err);
      alert('문제 추가 중 오류가 발생했습니다.');
      refreshStatus.classList.add('hidden');
    }
  });
  
  // 하나의 문제만 처리 (일일 처리 실행)
  executeOneBtn.addEventListener('click', async () => {
    if (problemsQueue.length === 0) {
      alert('큐에 처리할 문제가 없습니다.');
      return;
    }
    
    // 대기 중인 문제만 필터링
    const waitingProblems = problemsQueue.filter(item => 
      item.status === 'waiting' || item.status === 'pending'
    );
    
    if (waitingProblems.length === 0) {
      alert('대기 중인 문제가 없습니다.');
      return;
    }
    
    try {
      // 로딩 표시
      loadingElem.classList.remove('hidden');
      
      // 백엔드에 일일 처리 요청
      const response = await fetch(`${API_URL}/run-daily`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        alert(`일일 처리 실패: ${errorData.error || '알 수 없는 오류'}`);
        loadingElem.classList.add('hidden');
        return;
      }
      
      const data = await response.json();
      console.log('일일 처리 결과:', data);
      
      if (data.message) {
        // 처리할 문제가 없는 경우
        alert(data.message);
      } else if (data.result) {
        // 문제가 처리된 경우, 결과 표시
        const problemId = data.problem_id;
        document.getElementById('problemId').value = problemId;
        
        // 결과 표시
        resultTitle.textContent = `백준 ${problemId}번 문제 해결 코드`;
        codeResult.textContent = data.result.code;
        
        // 빈 결과 숨기고 코드 표시
        emptyResult.classList.add('hidden');
        codeResultWrapper.classList.remove('hidden');
        
        // 코드 하이라이팅 적용
        hljs.highlightElement(codeResult);
        
        // 참고 자료 표시
        sourcesList.innerHTML = '';
        if (data.result.sources && data.result.sources.length > 0) {
          data.result.sources.forEach((link, idx) => {
            const host = new URL(link).hostname;
            const li = document.createElement('li');
            li.innerHTML = `${idx + 1}. <a href="${link}" target="_blank" class="text-blue-500 hover:underline">${host}</a>`;
            sourcesList.appendChild(li);
          });
        } else {
          sourcesList.innerHTML = '<li class="text-gray-500">참고 자료가 없습니다.</li>';
        }
      }
      
      // 문제 목록 새로고침
      await loadProblemsFromFirebase(true);
    } catch (err) {
      console.error('일일 처리 중 오류:', err);
      alert('일일 처리 중 오류가 발생했습니다.');
    } finally {
      loadingElem.classList.add('hidden');
    }
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
    
    // 대기 중인 문제를 우선 표시하도록 정렬
    const sortedProblems = [...problemsQueue].sort((a, b) => {
      // 상태별 우선순위: waiting > processing > completed > failed
      const priorityMap = { 
        waiting: 0, 
        pending: 0, 
        processing: 1, 
        completed: 2, 
        failed: 3 
      };
      
      return priorityMap[a.status] - priorityMap[b.status];
    });
    
    // 큐 목록 업데이트
    problemQueue.innerHTML = '';
    sortedProblems.forEach(problem => {
      const tr = document.createElement('tr');
      tr.className = 'border-t border-gray-200 dark:border-gray-700';
      
      // 상태에 따른 배지 스타일
      let statusBadge = '';
      switch(problem.status) {
        case 'waiting':
        case 'pending':
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
      
      // 문제 상태에 따라 버튼 텍스트 및 스타일 변경
      // isCompleted 필드를 사용하여 완료 여부 판단 (수정된 부분)
      const isCompleted = problem.isCompleted;
      const buttonText = isCompleted ? '조회' : '실행';
      const buttonClass = isCompleted 
        ? 'text-blue-500 hover:text-blue-700' 
        : 'text-green-500 hover:text-green-700';
      
      tr.innerHTML = `
        <td class="px-4 py-2">${problem.id}</td>
        <td class="px-4 py-2">${statusBadge}</td>
        <td class="px-4 py-2">
          <button class="${buttonClass} view-btn mr-2" data-id="${problem.id}" data-completed="${isCompleted}">
            ${buttonText}
          </button>
          <button class="text-red-500 hover:text-red-700 remove-btn" data-id="${problem.id}">
            삭제
          </button>
        </td>
      `;
      
      problemQueue.appendChild(tr);
    });
    
    // 삭제 버튼 이벤트 추가
    document.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', async function() {
        const problemId = this.getAttribute('data-id');
        if (confirm(`문제 ${problemId}를 큐에서 삭제하시겠습니까?`)) {
          try {
            refreshStatus.textContent = '문제 삭제 중...';
            refreshStatus.classList.remove('hidden');
            
            const response = await fetch(`${API_URL}/delete-problem/${problemId}`, {
              method: 'DELETE'
            });
            
            if (!response.ok) {
              const errorData = await response.json();
              alert(`삭제 실패: ${errorData.error || '알 수 없는 오류'}`);
              refreshStatus.classList.add('hidden');
              return;
            }
            
            // 문제 목록 새로고침
            await loadProblemsFromFirebase(true);
            
            refreshStatus.textContent = '문제가 성공적으로 삭제되었습니다';
            setTimeout(() => {
              refreshStatus.classList.add('hidden');
            }, 1500);
          } catch (err) {
            console.error('문제 삭제 중 오류:', err);
            alert('문제 삭제 중 오류가 발생했습니다.');
            refreshStatus.classList.add('hidden');
          }
        }
      });
    });
    
    // 조회/실행 버튼 이벤트 추가 - 여기서 수정
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', async function() {
        const problemId = this.getAttribute('data-id');
        // data-status 대신 data-completed 사용 (수정된 부분)
        const isCompleted = this.getAttribute('data-completed') === 'true';
        document.getElementById('problemId').value = problemId;
        
        console.log(`문제 ${problemId} 버튼 클릭, 완료 여부: ${isCompleted}`);
        
        // 완료된 문제인 경우 Firebase에서 코드 가져오기
        if (isCompleted) {
          try {
            // 로딩 표시
            loadingElem.classList.remove('hidden');
            emptyResult.classList.add('hidden');
            codeResultWrapper.classList.add('hidden');
            errorContainer.classList.add('hidden');
            
            console.log(`Firebase에서 문제 ${problemId} 코드 조회 요청...`);
            
            // 코드 조회 API 호출
            const response = await fetch(`${API_URL}/get-problem-code/${problemId}`);
            console.log(`API 응답 상태: ${response.status}`);
            
            if (!response.ok) {
              console.error(`코드 조회 실패 - 상태 코드: ${response.status}`);
              showError(`코드 조회 실패: ${response.statusText}. 코드를 다시 생성합니다.`);
              await generateCode(problemId);
              return;
            }
            
            const data = await response.json();
            console.log('Firebase에서 가져온 코드 데이터:', data);
            
            // API 응답 상태 확인 (수정된 부분) - success와 completed 구분
            if (data.status !== 'success' || !data.code) {
              console.error('코드 데이터 오류:', data);
              showError('코드를 가져오지 못했습니다. 코드를 다시 생성합니다.');
              await generateCode(problemId);
              return;
            }
            
            // 결과 표시
            resultTitle.textContent = `백준 ${data.problem_id}번 문제 해결 코드 (저장됨)`;
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
            
          } catch (err) {
            console.error('코드 조회 중 오류:', err);
            showError(`코드 조회 중 오류가 발생했습니다: ${err.message}. 코드를 다시 생성합니다.`);
            await generateCode(problemId);
          } finally {
            loadingElem.classList.add('hidden');
          }
        } else {
          // 미완료 문제는 생성 요청
          console.log(`미완료 문제이므로 코드 생성 요청`);
          await generateCode(problemId);
        }
      });
    });
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
  
  // 자동 새로고침 설정 (30초마다 Firebase 상태 업데이트)
  setInterval(() => loadProblemsFromFirebase(), 30000);
});