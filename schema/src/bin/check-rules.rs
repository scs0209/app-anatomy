//! 규칙 파일을 타입으로 읽고 검증한다. 사용법: check-rules 파일.json [...]
fn main() {
    let mut bad = 0;
    for path in std::env::args().skip(1) {
        let text = match std::fs::read_to_string(&path) {
            Ok(t) => t,
            Err(e) => { println!("{path}: 읽지 못함: {e}"); bad += 1; continue; }
        };
        match serde_json::from_str::<anatomy_schema::rules::RuleFile>(&text) {
            Err(e) => { println!("{path}: 형식 오류 (줄 {}, 칸 {}): {e}", e.line(), e.column()); bad += 1; }
            Ok(file) => {
                let errs = anatomy_schema::rules::validate(&file);
                let matches: usize = file.rules.iter().map(|r| r.matches.len()).sum();
                if errs.is_empty() {
                    println!("{path}: 통과 (규칙 {}건, 일치 조건 {}건)", file.rules.len(), matches);
                } else {
                    println!("{path}: {}건", errs.len());
                    for e in errs.iter().take(20) {
                        println!("   {}: {}", e.id.as_deref().unwrap_or("(파일)"), e.message);
                    }
                    bad += 1;
                }
            }
        }
    }
    std::process::exit(if bad > 0 { 1 } else { 0 });
}
