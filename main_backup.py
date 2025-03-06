import os
import asyncio
import concurrent.futures
import base64
import logging
import urllib.parse
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from openai import OpenAI

# 환경 변수 로드 (.env)
load_dotenv()

# 로깅 설정 (INFO 레벨만 보이도록 설정)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 최적화를 위한 전역 HTTP 세션(Session) 생성
session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/91.0.4472.124 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7"
})

# OpenRouter API 클라이언트 초기화
client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENROUTER_API_KEY"),
)

def fetch_google_results(problem_id):
    """
    Google Custom Search JSON API를 이용해
    '백준 {problem_id} 자바 풀이 site:tistory.com' 형태로 검색 후,
    Tistory 링크 최대 3개를 반환하는 함수.
    """
    logger.info(f"[1/4] Google Custom Search로 백준 {problem_id} 검색 중...")

    # .env 등에 미리 설정된 API 키와 CSE ID
    API_KEY = os.getenv("GCP_API_KEY")  # GCP에서 발급한 API 키
    CX_ID = os.getenv("CSE_ID")         # Custom Search Engine ID

    if not API_KEY or not CX_ID:
        logger.error("GCP_API_KEY 또는 CSE_ID가 설정되지 않았습니다.")
        return []

    search_query = f"site:tistory.com 백준 {problem_id} 자바 풀이"
    url = f"https://www.googleapis.com/customsearch/v1?q={search_query}&cx={CX_ID}&key={API_KEY}"

    try:
        response = session.get(url)
        response.raise_for_status()
        data = response.json()

        items = data.get("items", [])
        all_links = [item["link"] for item in items if "link" in item]

        # 최대 3개만 반환
        results = all_links[:3]
        logger.info(f"  - {len(results)}개의 Tistory 링크를 찾았습니다.")
        return results

    except requests.RequestException as e:
        logger.error(f"Error fetching Google results: {e}", exc_info=True)
        return []

def extract_code_and_summary_from_blog(blog_url):
    logger.info(f"  - 블로그 페이지 요청: {blog_url}")
    try:
        response = session.get(blog_url)
        response.raise_for_status()
    except requests.RequestException as e:
        logger.error(f"블로그 요청 에러: {e}", exc_info=True)
        return None

    try:
        soup = BeautifulSoup(response.text, "html.parser")
    except Exception as e:
        logger.error("블로그 HTML 파싱 중 오류", exc_info=True)
        return None

    # 주 콘텐츠 추출 (티스토리 테마에 따라 다를 수 있음)
    main_content_div = soup.find('div', class_='tt_article_useless_p_margin contents_style')
    if not main_content_div:
        logger.warning("블로그 메인 콘텐츠를 찾지 못했습니다.")
        return None

    # 스크립트/스타일 제거
    for tag in main_content_div.find_all(['script', 'style']):
        tag.decompose()

    # 텍스트 일부만 표시
    blog_text_full = main_content_div.get_text(separator="\n", strip=True)
    blog_text_preview = blog_text_full[:50] + "..." if len(blog_text_full) > 50 else blog_text_full
    logger.info(f"    ⤷ 블로그 텍스트(일부): {blog_text_preview}")

    # 코드 블록 추출
    code_blocks = []
    for pre_tag in main_content_div.find_all('pre'):
        code_tag = pre_tag.find('code')
        if code_tag:
            code_text = code_tag.get_text(separator="\n", strip=True)
            if code_text:
                code_blocks.append(code_text)
    code_combined = "\n\n".join(code_blocks)
    if code_combined:
        logger.info("    ⤷ 코드 블록을 추출했습니다.")
    else:
        logger.info("    ⤷ 코드 블록이 없습니다.")

    # GPT 요약 요청
    summary_prompt = (
        "다음은 블로그의 설명 부분입니다. 이를 요약해주세요.\n\n설명 내용:\n"
        f"{blog_text_full}"
    )
    try:
        summary_response = client.chat.completions.create(
            model="deepseek/deepseek-r1:free",
            messages=[
                {"role": "system", "content": "You are a helpful assistant for summarizing text."},
                {"role": "user", "content": summary_prompt}
            ]
        )
        summary = summary_response.choices[0].message.content.strip()
        # 요약 일부만 로그로 확인
        summary_preview = summary[:60] + "..." if len(summary) > 60 else summary
        logger.info(f"    ⤷ 요약 생성 완료(일부): {summary_preview}")
    except Exception as e:
        logger.error(f"요약 생성 에러: {e}", exc_info=True)
        summary = ""

    return {"summary": summary, "code": code_combined if code_combined else ""}

async def process_blog_urls(blog_urls):
    logger.info(f"[2/4] 블로그 {len(blog_urls)}개 동시 처리 시작")
    loop = asyncio.get_event_loop()
    with concurrent.futures.ThreadPoolExecutor() as executor:
        tasks = [
            loop.run_in_executor(executor, extract_code_and_summary_from_blog, url)
            for url in blog_urls
        ]
        results = await asyncio.gather(*tasks)
    logger.info("모든 블로그 처리 완료")
    return results

def send_results_to_gpt(results):
    logger.info("[3/4] 블로그 코드 통합 요청 중...")
    prompt = (
        "다음은 여러 블로그에서 추출한 요약과 코드입니다. "
        "이를 사용해서 같은 결과값이 나올 수 있는 단일 Java 코드를 작성해주세요. "
        "기존 코드를 최대한 활용하고 크게 변경하지 마세요. "
        "답변은 다른 말 한마디 없이 단순 코드 텍스트만 포함되어야 합니다 백틱도 없습니다.\n\n"
    )
    for idx, result in enumerate(results, start=1):
        if not result:
            continue
        summary = result.get('summary', '')
        code = result.get('code', '')
        prompt += f"### Blog {idx} 요약:\n{summary}\n### Blog {idx} 코드:\n{code}\n\n"

    try:
        response = client.chat.completions.create(
            model="deepseek/deepseek-r1:free",
            messages=[
                {"role": "system", "content": "You are a coding assistant for integrating and refining code."},
                {"role": "user", "content": prompt}
            ]
        )
        integrated_code = response.choices[0].message.content.strip()
        logger.info("  - 최종 통합 코드 생성 완료")
        return integrated_code
    except Exception as e:
        logger.error(f"통합 코드 생성 에러: {e}", exc_info=True)
        return None

def upload_to_github(file_name, file_content, repo, branch, token):
    logger.info("[4/4] GitHub에 최종 코드 업로드 중...")
    if not (repo and token):
        logger.error("GitHub 정보가 설정되지 않았습니다.")
        return

    url = f"https://api.github.com/repos/{repo}/contents/{file_name}"
    encoded_content = base64.b64encode(file_content.encode()).decode()
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3+json"
    }

    try:
        response = session.get(url, headers=headers)
        if response.status_code == 200:
            sha = response.json().get('sha')
            data = {
                "message": f"Update {file_name}",
                "content": encoded_content,
                "branch": branch,
                "sha": sha
            }
        elif response.status_code == 404:
            data = {
                "message": f"Add {file_name}",
                "content": encoded_content,
                "branch": branch
            }
        else:
            logger.error(f"GitHub 파일 체크 실패: {response.status_code}")
            return

        response = session.put(url, headers=headers, json=data)
        if response.status_code in [200, 201]:
            logger.info(f"✅ GitHub 업로드 성공: {file_name}")
        else:
            logger.error(f"❌ GitHub 업로드 실패: {response.status_code}")
            logger.error(response.json())
    except Exception as e:
        logger.error("GitHub 업로드 도중 오류", exc_info=True)

if __name__ == "__main__":
    logger.info("프로그램 시작")
    problem_id = input("Enter the Baekjoon problem ID: ").strip()

    # 1. Google Custom Search API
    tistory_links = fetch_google_results(problem_id)
    if not tistory_links:
        logger.error("검색된 Tistory 링크가 없습니다. 프로그램을 종료합니다.")
        exit()

    logger.info("검색된 Tistory 링크 목록:")
    for idx, link in enumerate(tistory_links, start=1):
        logger.info(f"  {idx}. {link}")

    # 2. 블로그들 동시 처리 (요약 + 코드)
    results = asyncio.run(process_blog_urls(tistory_links))

    # 3. 통합된 Java 코드 요청
    final_result = send_results_to_gpt(results)
    if not final_result:
        logger.error("통합 코드 생성에 실패했습니다.")
        exit()

    logger.info("\n--- 최종 통합 코드 ---")
    logger.info(final_result)

    # 4. GitHub에 업로드
    repo = os.getenv("GITHUB_REPO")
    branch = os.getenv("GITHUB_BRANCH", "main")
    token = os.getenv("GITHUB_TOKEN")
    file_name = f"BOJ_{problem_id}.java"
    upload_to_github(file_name, final_result, repo, branch, token)
