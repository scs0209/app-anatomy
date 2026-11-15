fn main() {
    let which = std::env::args().nth(1).unwrap_or_else(|| "result".into());
    let schema = match which.as_str() {
        "result" => schemars::schema_for!(anatomy_schema::AnatomyResult),
        "rules" => schemars::schema_for!(anatomy_schema::rules::RuleFile),
        other => {
            eprintln!("unknown schema: {other} (result | rules)");
            std::process::exit(2);
        }
    };
    println!("{}", serde_json::to_string_pretty(&schema).unwrap());
}
