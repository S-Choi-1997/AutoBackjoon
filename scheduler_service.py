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