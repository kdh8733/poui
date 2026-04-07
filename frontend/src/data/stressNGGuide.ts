// Stress-NG test guide data extracted from stress-ng-guide.html
// Groups and detailed test info for UI integration

export interface StressNGTest {
  id: number;
  name: string;
  measure: string;       // what it measures
  cpuFeatures: string;   // CPU acceleration features
  description: string;
  useCases: string;
  tips: string;
}

export interface StressNGGroup {
  id: string;
  title: string;
  titleKo: string;
  icon: string;
  color: string;
  hwSensitivity: string[];
  testIds: number[];
}

export const STRESS_NG_TESTS: Record<number, StressNGTest> = {
  1:  { id:1,  name:'CPU Stress',              measure:'정수/분기/기본 FP 혼합 → IPC/지속 클럭',   cpuFeatures:'스칼라 ALU/FPU, 분기예측',                          description:'코어 자체 지속 성능',      useCases:'범용 서버, 간단 계산 워크로드',       tips:'동일 코어/스레드/클럭 고정' },
  2:  { id:2,  name:'Crypto',                  measure:'암호/해시 부하 → AES/SHA 가속',           cpuFeatures:'AES‑NI/VAES, PCLMUL, SHA 확장',                      description:'암호 가속 효과',           useCases:'TLS 종료, 디스크 암호화, VPN',       tips:'동일 라이브러리·옵션 고정' },
  3:  { id:3,  name:'Memory Copying',          measure:'대량 memcpy → 메모리 대역폭',             cpuFeatures:'AVX(‑512) 최적화 memcpy(빌드 의존)',                   description:'대용량 복사',              useCases:'인메모리 DB, ETL/미디어',            tips:'메모리 채널/정렬 영향' },
  4:  { id:4,  name:'Glibc Qsort',             measure:'비교 정렬 → 분기예측/캐시',               cpuFeatures:'분기예측, L1/L2',                                     description:'qsort 기반 정렬',          useCases:'DB ORDER BY, 로그/랭킹',             tips:'키 분포/비교 함수 비용' },
  5:  { id:5,  name:'C String Funcs',          measure:'strlen/strcmp/mem* → 메모리 BW',          cpuFeatures:'IFUNC 최적화(빌드 의존)',                              description:'문자열 처리',              useCases:'헤더 파싱, 텍스트 파서',             tips:'문자 인코딩/패턴 영향' },
  6:  { id:6,  name:'Vector Math',             measure:'벡터 산술 → SSE/AVX/AVX‑512',            cpuFeatures:'SIMD 파이프, 로드/스토어, 셔플',                       description:'벡터 연산(내적 등)',       useCases:'3D/물리, DSP/필터',                  tips:'AVX‑512 다운클럭 주의' },
  7:  { id:7,  name:'Matrix Math',             measure:'조밀 행렬 → FPU/SIMD + 캐시',            cpuFeatures:'FMA, 캐시 재사용',                                    description:'행렬 곱/연산',             useCases:'BLAS, 과학계산',                     tips:'블로킹/타일 크기 중요' },
  8:  { id:8,  name:'Forking',                 measure:'프로세스 생성/종료 비용',                 cpuFeatures:'COW/TLB/스케줄러',                                    description:'프로세스 라이프사이클',    useCases:'프리포크 서버, 런처',                tips:'컨테이너/보안옵션 영향' },
  9:  { id:9,  name:'System V Message Passing',measure:'SysV 메시지 큐 → IPC 복사',              cpuFeatures:'커널/유저 경계 복사',                                 description:'레거시 IPC',               useCases:'레거시 미들웨어',                    tips:'소켓/공유메모리 대비 참고' },
  10: { id:10, name:'Semaphores',              measure:'세마포어 동기화 경합',                    cpuFeatures:'대기/깨우기 경로',                                    description:'락/시그널링',              useCases:'DB/HPC 공유메모리',                  tips:'경합 수준 동일화' },
  11: { id:11, name:'Socket Activity',         measure:'로컬 소켓 I/O → syscalls',               cpuFeatures:'send/recv, TCP/UNIX',                                 description:'연결/전송/종료',           useCases:'프록시, 게임서버',                   tips:'오프로딩/NUMA 영향' },
  12: { id:12, name:'Context Switching',       measure:'문맥 전환 오버헤드',                      cpuFeatures:'스케줄러/레지스터 저장',                              description:'스레드 전환',              useCases:'고동시성 서버',                      tips:'고정 배치·전력 정책' },
  13: { id:13, name:'Atomic',                  measure:'원자 연산→코히어런시',                   cpuFeatures:'CMPXCHG/MESIF',                                       description:'락‑프리 기본',             useCases:'카운터/큐/맵',                       tips:'NUMA 바인딩 권장' },
  14: { id:14, name:'CPU Cache',               measure:'L1/L2/L3 지연·대역',                     cpuFeatures:'프리패처/라인 충돌/TLB',                              description:'선형·랜덤 접근',           useCases:'실시간 분석/인덱스',                 tips:'L3 용량/토폴로지' },
  15: { id:15, name:'Malloc',                  measure:'동적 할당/해제',                          cpuFeatures:'할당자/락 경합',                                      description:'작은 객체 반복',           useCases:'웹 프레임워크',                      tips:'동일 할당자 필수' },
  16: { id:16, name:'MEMFD',                   measure:'memfd/공유 매핑',                         cpuFeatures:'tmpfs/페이지 캐시',                                   description:'디스크 없는 IPC',          useCases:'브라우저/미디어 파이프',             tips:'커널/보안옵션 영향' },
  17: { id:17, name:'MMAP',                    measure:'mmap/munmap/폴트',                        cpuFeatures:'TLB/NUMA/THP',                                        description:'파일·익명 매핑',           useCases:'LMDB/파일 스캔',                     tips:'THP/NUMA 정책' },
  18: { id:18, name:'NUMA',                    measure:'원격/로컬 메모리',                        cpuFeatures:'UPI/QPI/컨트롤러',                                    description:'노드간 접근비용',          useCases:'대용량 인메모리',                    tips:'스레드·메모리 고정' },
  19: { id:19, name:'x86_64 RdRand',           measure:'하드웨어 RNG',                            cpuFeatures:'RDRAND/RDSEED',                                       description:'난수 발생',                useCases:'키 시드/토큰',                       tips:'보안상 직접 사용 제한' },
  20: { id:20, name:'SENDFILE',                measure:'파일→소켓 제로카피',                     cpuFeatures:'페이지캐시/zero‑copy',                                description:'sendfile 경로',            useCases:'정적 서빙/CDN',                      tips:'오프로딩/대용량 유리' },
  21: { id:21, name:'IO_uring',                measure:'비동기 I/O 큐',                           cpuFeatures:'SQ/CQ 공유링',                                        description:'유저↔커널 경로',           useCases:'프록시/스토리지',                    tips:'커널/드라이버 의존' },
  22: { id:22, name:'Futex',                   measure:'유저 락의 커널 경합',                     cpuFeatures:'wait/wake',                                           description:'경합시 커널 진입',         useCases:'Go/Java 런타임',                     tips:'경합 수준 통제' },
  23: { id:23, name:'Mutex',                   measure:'Pthread mutex',                           cpuFeatures:'빠른/느린 경로',                                      description:'상호배제 오버헤드',        useCases:'DB/게임 루프',                       tips:'스핀·슬립 정책' },
  24: { id:24, name:'Function Call',           measure:'호출/리턴 프론트엔드',                    cpuFeatures:'call/ret/RSB',                                        description:'짧은 함수 반복',           useCases:'인터프리터/미들웨어',                tips:'인라이닝/LTO 영향' },
  25: { id:25, name:'Poll',                    measure:'poll/epoll 다중화',                       cpuFeatures:'FD 스캔/레디리스트',                                  description:'대량 FD 감시',             useCases:'Nginx/Envoy/NIO',                    tips:'커널·타임아웃 영향' },
  26: { id:26, name:'Hash',                    measure:'일반 해시 계산',                          cpuFeatures:'곱셈/회전/혼합',                                      description:'키 요약',                  useCases:'해시테이블/샤딩',                    tips:'키 길이/분포' },
  27: { id:27, name:'Pthread',                 measure:'스레드 생성/조인',                        cpuFeatures:'TLS/스케줄러',                                        description:'스레드 라이프사이클',      useCases:'워커 풀/HPC',                        tips:'스택/정책 동일화' },
  28: { id:28, name:'Zlib',                    measure:'Deflate 압축',                            cpuFeatures:'crc/Huffman(+SIMD)',                                   description:'텍스트·바이너리 압축',     useCases:'HTTP/백업/오브젝트',                 tips:'레벨/라이브러리 고정' },
  29: { id:29, name:'Floating Point',          measure:'스칼라 FP',                               cpuFeatures:'FADD/FMUL/FDIV',                                      description:'기초 실수 연산',           useCases:'금융/필터/과학',                     tips:'FDIV 비중 주의' },
  30: { id:30, name:'Fused Multiply-Add',      measure:'Fused Multiply‑Add',                     cpuFeatures:'FMA3/FMA4',                                           description:'곱셈+덧셈 1사이클',        useCases:'ML/DSP/물리',                        tips:'유닛 수/클럭 영향' },
  31: { id:31, name:'Pipe',                    measure:'파이프 IPC',                              cpuFeatures:'버퍼/wakeup',                                         description:'프로세스 간 통신',         useCases:'파이프라인/ETL',                     tips:'버퍼/스케줄러' },
  32: { id:32, name:'Matrix 3D Math',          measure:'3D 변환',                                 cpuFeatures:'SIMD/쿼터니언',                                       description:'4×4 변환/곱',              useCases:'게임/AR/VR/CAD',                     tips:'데이터 레이아웃' },
  33: { id:33, name:'AVL Tree',                measure:'균형 트리 접근',                          cpuFeatures:'분기예측/포인터',                                     description:'삽입/탐색/삭제',           useCases:'인메모리 인덱스',                    tips:'메모리 지연 민감' },
  34: { id:34, name:'Vector Floating Point',   measure:'벡터화 FP',                               cpuFeatures:'AVX/AVX‑512',                                         description:'벡터 실수 계산',           useCases:'신호/영상/수치',                     tips:'벡터 폭/레지스터' },
  35: { id:35, name:'Vector Shuffle',          measure:'퍼뮤트/셔플',                             cpuFeatures:'PSHUFB/VPERM',                                        description:'요소 재배열/혼합',         useCases:'코덱/전처리/암호',                   tips:'셔플 대역 병목' },
  36: { id:36, name:'Wide Vector Math',        measure:'최대 벡터폭',                             cpuFeatures:'512b SIMD/마스크',                                    description:'넓은 벡터 연산',           useCases:'HPC/과학',                           tips:'클럭 다운 주의' },
  37: { id:37, name:'Cloning',                 measure:'clone/vfork',                             cpuFeatures:'네임스페이스/flags',                                  description:'경량 생성',                useCases:'컨테이너/샌드박스',                  tips:'cgroup 조합 영향' },
  38: { id:38, name:'AVX-512 VNNI',            measure:'INT8 dot‑product',                       cpuFeatures:'VPDP* 양자화',                                        description:'INT8 곱누적',              useCases:'DNN 추론/추천',                      tips:'지원 유무 절벽형' },
  39: { id:39, name:'Mixed Scheduler',         measure:'혼합 부하',                               cpuFeatures:'스레드/IPC/연산 혼합',                                description:'현실적 스케줄',            useCases:'마이크로서비스',                     tips:'P/E 코어 배치' },
  40: { id:40, name:'Exponential Math',        measure:'exp 함수',                                cpuFeatures:'libm 벡터/보정',                                      description:'지수 계산',                useCases:'softmax/옵션가격',                   tips:'정확도 모드 영향' },
  41: { id:41, name:'Fractal Generator',       measure:'반복 FP+분기',                            cpuFeatures:'탈출조건/분기',                                       description:'프랙탈 생성',              useCases:'절차적 그래픽',                      tips:'브랜치 민감' },
  42: { id:42, name:'Logarithmic Math',        measure:'log/ln',                                  cpuFeatures:'근사/보정',                                           description:'로그 계산',                useCases:'정규화/통계',                        tips:'라운딩/정확도' },
  43: { id:43, name:'Power Math',              measure:'pow',                                     cpuFeatures:'지수·로그 결합',                                      description:'거듭제곱',                 useCases:'감마/색공간/과학',                   tips:'정수/실수 지수 차' },
  44: { id:44, name:'Trigonometric Math',      measure:'sin/cos/tan',                             cpuFeatures:'근사/테이블',                                         description:'삼각함수',                 useCases:'그래픽/로보틱스',                    tips:'벡터화 유무' },
  45: { id:45, name:'Jpeg Compression',        measure:'JPEG 인코딩',                             cpuFeatures:'DCT/양자화/Huffman',                                  description:'이미지 압축',              useCases:'썸네일/미디어',                      tips:'품질/라이브러리 고정' },
  46: { id:46, name:'Bitonic Integer Sort',    measure:'비토닉 정렬',                             cpuFeatures:'정렬 네트워크',                                       description:'비분기적 패턴',            useCases:'HPC/실시간',                         tips:'메모리 패턴 중요' },
  47: { id:47, name:'Radix String Sort',       measure:'문자열 기수 정렬',                        cpuFeatures:'버킷/패스 반복',                                      description:'자리수별 정렬',            useCases:'로그/색인',                          tips:'문자집합/분포' },
  48: { id:48, name:'POSIX Regular Expressions',measure:'정규식 매칭',                            cpuFeatures:'NFA/DFA/백트랙',                                      description:'패턴 매칭',                useCases:'로그 필터/WAF',                      tips:'패턴 복잡도' },
  49: { id:49, name:'Integer Math',            measure:'정수 산술',                               cpuFeatures:'ADD/MUL/DIV',                                         description:'정수 계산 전반',           useCases:'집계/시뮬/암호일부',                 tips:'DIV 병목 주의' },
  50: { id:50, name:'Integer Bit Operations',  measure:'비트 조작',                               cpuFeatures:'POPCNT/BMI2',                                         description:'시프트/마스크',            useCases:'코덱/블룸/패킷',                     tips:'BMI2/POPCNT 유무' },
  51: { id:51, name:'Bessel Math Operations',  measure:'특수함수',                                cpuFeatures:'libm 고정밀',                                         description:'베셀 계열',                useCases:'전파/진동',                          tips:'정확도 옵션' },
  52: { id:52, name:'Hyperbolic Trigonometric Math', measure:'sinh/cosh/tanh',                   cpuFeatures:'근사/보정',                                           description:'쌍곡선 함수',              useCases:'ML 활성함수/통신',                   tips:'범위 축소' },
};

export const STRESS_NG_GROUPS: StressNGGroup[] = [
  {
    id: 'simd',
    title: 'Numerical / SIMD',
    titleKo: '수치 연산·SIMD (벡터/행렬/특수함수)',
    icon: '⚡',
    color: '#f59e0b',
    hwSensitivity: [
      'SIMD 벡터 유닛 (SSE/AVX/AVX‑512), FMA, VNNI(INT8)',
      'FPU 파이프, XMM/YMM/ZMM 레지스터 파일',
      '프론트엔드(디코더/µop 캐시), L1D 대역폭',
      'AVX‑512 다운클럭, L2/L3 재사용, 메모리 정렬'
    ],
    testIds: [6,7,29,30,32,34,35,36,38,40,41,42,43,44,49,50,51,52],
  },
  {
    id: 'memory',
    title: 'Memory / NUMA',
    titleKo: '메모리 계층/할당/가상메모리 (NUMA 포함)',
    icon: '🧠',
    color: '#8b5cf6',
    hwSensitivity: [
      'DRAM 채널 수·속도(MT/s)·타이밍, 통합 메모리 컨트롤러(IMC)',
      'LLC(L3) 용량·대역·지연, 프리패처',
      'NUMA 패브릭 (UPI/Infinity Fabric)',
      'TLB/페이지워커, 페이지 크기(4K/2M/1G, THP)',
      '일관성 트래픽, 스토어 버퍼 정책, 할당자 락 경합'
    ],
    testIds: [3,14,15,16,17,18,33],
  },
  {
    id: 'kernel',
    title: 'Kernel / IPC / Scheduling',
    titleKo: '커널·IPC·스케줄링/동기화',
    icon: '🔀',
    color: '#06b6d4',
    hwSensitivity: [
      '코어 수·토폴로지(링/메시), SMT/HT, 코어간 지연',
      '캐시 일관성 인터커넥트 대역, IPI/APIC(x2APIC)',
      'NVMe 컨트롤러·큐, NIC 오프로딩(RSS/TSO/GSO), DMA 엔진',
      'TLB shootdown, 컨텍스트 저장/복원, 메모리 복사 대역'
    ],
    testIds: [8,9,10,11,12,13,20,21,22,23,25,27,31,37,39],
  },
  {
    id: 'data',
    title: 'Data Processing / Algorithms',
    titleKo: '데이터 처리 라이브러리/알고리즘 (문자열·정렬·해시·압축·암호)',
    icon: '📊',
    color: '#10b981',
    hwSensitivity: [
      '분기예측기/RSB, 캐시 지역성(L1/L2/L3)',
      'SIMD 가속(문자열/압축/JPEG), AES‑NI/VAES, PCLMULQDQ, SHA‑NI, CRC32, BMI2/POPCNT',
      '메모리 대역폭(memcpy/기수정렬)',
      'IFUNC 선택(AVX/AVX‑512), 데이터 키 분포·길이, 압축 품질'
    ],
    testIds: [2,4,5,26,28,45,46,47,48],
  },
  {
    id: 'core',
    title: 'Core Microarchitecture',
    titleKo: '코어 마이크로아키텍처/제어흐름·특수명령',
    icon: '🔬',
    color: '#f97316',
    hwSensitivity: [
      '프론트엔드 폭, µop 캐시, ROB, 발행 포트',
      '분기예측기/BTB/RSB, call/ret 경로',
      '정수 ALU/나눗셈 유닛, RDRAND/RDSEED',
      '터보/전력·온도 헤드룸, 마이크로코드, 인라이닝 영향'
    ],
    testIds: [1,19,24],
  },
];

// Map suite names from API to guide test IDs
export const SUITE_NAME_TO_TEST_ID: Record<string, number> = {
  'Hash': 26, 'MMAP': 17, 'NUMA': 18, 'Pipe': 31, 'Poll': 25,
  'Zlib': 28, 'Futex': 22, 'MEMFD': 16, 'Mutex': 23, 'Atomic': 13,
  'Crypto': 2, 'Malloc': 15, 'Cloning': 37, 'Forking': 8, 'Pthread': 27,
  'AVL Tree': 33, 'SENDFILE': 20, 'CPU Cache': 14, 'CPU Stress': 1,
  'Power Math': 43, 'Semaphores': 10, 'Matrix Math': 7, 'Vector Math': 6,
  'AVX-512 VNNI': 38, 'Integer Math': 49, 'Socket Activity': 11,
  'Function Call': 24, 'x86_64 RdRand': 19, 'Floating Point': 29,
  'Matrix 3D Math': 32, 'Memory Copying': 3, 'Vector Shuffle': 35,
  'Mixed Scheduler': 39, 'Exponential Math': 40, 'Jpeg Compression': 45,
  'Logarithmic Math': 42, 'Wide Vector Math': 36, 'Context Switching': 12,
  'Fractal Generator': 41, 'Radix String Sort': 47, 'Fused Multiply-Add': 30,
  'Trigonometric Math': 44, 'Bitonic Integer Sort': 46, 'Vector Floating Point': 34,
  'Bessel Math Operations': 51, 'Integer Bit Operations': 50,
  'Glibc C String Functions': 5, 'Glibc Qsort Data Sorting': 4,
  'System V Message Passing': 9, 'POSIX Regular Expressions': 48,
  'Hyperbolic Trigonometric Math': 52,
};
