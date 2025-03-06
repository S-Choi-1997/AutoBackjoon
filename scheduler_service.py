import os
import logging
import requests
import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore
from flask import Flask, request, jsonify

# Flask 앱 초기화
app = Flask(__name__)

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Firebase 초기화 (Google Cloud 기본 인증 사용)
firebase_admin.initialize_app()
db = firestore.client()

# 백준 솔버 서비스 URL
SOLVER_URL = os.getenv('SOLVER_SERVICE_URL')

@app.route('/', methods=['GET'])
def index():
    """간단한 웹 폼을 제공하는 홈페이지"""
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>백준 문제 추가</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
            form { margin-top: 20px; }
            input, button { padding: 8px; margin: 5px 0; }
            .container { display: flex; flex-direction: column; gap: 20px; }
            .card { border: 1px solid #ddd; border-radius: 8px; padding: 16px; }
            h2 { margin-top: 0; }
        </style>
    </head>
    <body>
        <h1>백준 문제 자동화 시스템</h1>
        
        <div class="container">
            <div class="card">
                <h2>문제 추가</h2>
                <form id="problemForm">
                    <div>
                        <label for="problem_id">문제 번호:</label>
                        <input type="text" id="problem_id" name="problem_id" required>
                    </div>
                    <button type="submit">추가하기</button>
                </form>
                <div id="addResult" style="margin-top: 10px;"></div>
            </div>
            
            <div class="card">
                <h2>일일 처리 수동 실행</h2>
                <button id="runDaily">지금 실행하기</button>
                <div id="runResult" style="margin-top: 10px;"></div>
            </div>
            
            <div class="card">
                <h2>대기 중인 문제 목록</h2>
                <button id="refreshProblems">새로고침</button>
                <div id="problemsList" style="margin-top: 10px;"></div>
            </div>
        </div>
        
        <script>
            // 문제 추가 폼 제출
            document.getElementById('problemForm').addEventListener('submit', async function(e) {
                e.preventDefault();
                const problem_id = document.getElementById('problem_id').value;
                const resultDiv = document.getElementById('addResult');
                
                try {
                    resultDiv.innerHTML = '<div>처리 중...</div>';
                    const response = await fetch('/add-problem', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ problem_id }),
                    });
                    
                    const data = await response.json();
                    if (response.ok) {
                        resultDiv.innerHTML = `<div style="color: green;">성공: ${data.message}</div>`;
                        document.getElementById('problem_id').value = '';
                    } else {
                        resultDiv.innerHTML = `<div style="color: red;">오류: ${data.error}</div>`;
                    }
                } catch (error) {
                    resultDiv.innerHTML = `<div style="color: red;">오류: ${error.message}</div>`;
                }
            });
            
            // 일일 처리 수동 실행
            document.getElementById('runDaily').addEventListener('click', async function() {
                const resultDiv = document.getElementById('runResult');
                
                try {
                    resultDiv.innerHTML = '<div>처리 중... (최대 5분 소요)</div>';
                    const response = await fetch('/run-daily', {
                        method: 'POST'
                    });
                    
                    const data = await response.json();
                    if (response.ok) {
                        if (data.message) {
                            resultDiv.innerHTML = `<div>${data.message}</div>`;
                        } else {
                            resultDiv.innerHTML = `<div style="color: green;">
                                문제 ${data.problem_id} 처리 완료<br>
                                ${data.result.github_upload === '성공' ? 
                                    `GitHub에 업로드됨: ${data.result.github_file}` : 
                                    'GitHub 업로드 안됨'}
                            </div>`;
                        }
                    } else {
                        resultDiv.innerHTML = `<div style="color: red;">오류: ${data.error}</div>`;
                    }
                } catch (error) {
                    resultDiv.innerHTML = `<div style="color: red;">오류: ${error.message}</div>`;
                }
            });
            
            // 문제 목록 새로고침
            async function loadProblems() {
                const listDiv = document.getElementById('problemsList');
                
                try {
                    listDiv.innerHTML = '<div>로딩 중...</div>';
                    const response = await fetch('/list-problems');
                    
                    const data = await response.json();
                    if (response.ok) {
                        if (data.problems.length === 0) {
                            listDiv.innerHTML = '<div>대기 중인 문제가 없습니다.</div>';
                        } else {
                            let html = '<ul>';
                            data.problems.forEach(p => {
                                html += `<li>문제 ${p.id}</li>`;
                            });
                            html += '</ul>';
                            listDiv.innerHTML = html;
                        }
                    } else {
                        listDiv.innerHTML = `<div style="color: red;">오류: ${data.error}</div>`;
                    }
                } catch (error) {
                    listDiv.innerHTML = `<div style="color: red;">오류: ${error.message}</div>`;
                }
            }
            
            document.getElementById('refreshProblems').addEventListener('click', loadProblems);
            
            // 페이지 로드 시 문제 목록 로드
            loadProblems();
        </script>
    </body>
    </html>
    """

@app.route('/health', methods=['GET'])
def health_check():
    """상태 확인 엔드포인트"""
    return jsonify({"status": "healthy"}), 200

@app.route('/add-problem', methods=['POST'])
def add_problem():
    """새 문제를 Firebase에 추가하는 엔드포인트"""
    data = request.json
    problem_id = data.get('problem_id')
    
    if not problem_id:
        return jsonify({"error": "problem_id가 필요합니다."}), 400
    
    try:
        # 간단하게 문제 ID만 저장
        db.collection('problems').document(problem_id).set({
            'problem_id': problem_id,
            'status': 'pending'
        })
        
        return jsonify({
            "status": "success",
            "message": f"문제 {problem_id}가 추가되었습니다."
        })
    except Exception as e:
        logger.error(f"문제 추가 중 오류: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/list-problems', methods=['GET'])
def list_problems():
    """대기 중인 문제 목록을 반환하는 엔드포인트"""
    try:
        problems_ref = db.collection('problems').where('status', '==', 'pending')
        problems = list(problems_ref.stream())
        
        problem_list = []
        for problem in problems:
            problem_list.append({
                'id': problem.id,
                'data': problem.to_dict()
            })
        
        return jsonify({
            "status": "success",
            "problems": problem_list
        })
    except Exception as e:
        logger.error(f"문제 목록 조회 중 오류: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/run-daily', methods=['POST'])
def run_daily_problem():
    """Cloud Scheduler에서 호출할 일일 실행 엔드포인트"""
    # 간단한 인증 (선택사항)
    secret = os.getenv('SCHEDULER_SECRET')
    auth_header = request.headers.get('Authorization')
    
    if secret and (not auth_header or auth_header != f"Bearer {secret}"):
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        # 1. Firebase에서 처리되지 않은 문제 가져오기
        problems_ref = db.collection('problems').where('status', '==', 'pending').limit(1)
        problems = list(problems_ref.stream())
        
        if not problems:
            return jsonify({"message": "처리할 문제가 없습니다."}), 200
        
        # 첫 번째 문제 가져오기
        problem_doc = problems[0]
        problem_id = problem_doc.id
        
        # 2. 백준 솔버 서비스에 요청
        response = requests.post(
            f"{SOLVER_URL}/generate",
            json={"problem_id": problem_id},
            timeout=300  # 5분 타임아웃
        )
        
        if response.status_code != 200:
            logger.error(f"솔버 요청 실패: {response.text}")
            # 문제 상태 업데이트 (실패)
            problem_doc.reference.update({
                'status': 'failed',
                'error': response.text
            })
            return jsonify({"error": "솔버 요청 실패"}), 500
        
        # 3. 결과 저장
        result = response.json()
        problem_doc.reference.update({
            'status': 'completed',
            'result': result
        })
        
        return jsonify({
            "status": "success",
            "problem_id": problem_id,
            "result": result
        })
        
    except Exception as e:
        logger.error(f"일일 작업 실행 중 오류: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)