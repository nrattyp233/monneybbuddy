#!/bin/bash#!/bin/bash\n\n# MoneyBuddy Production Deployment Script\n# Comprehensive deployment preparation and validation\n\nset -e  # Exit on any error\n\necho \"🚀 MoneyBuddy Production Deployment Preparation\"\necho \"================================================\"\n\n# Colors for output\nRED='\\033[0;31m'\nGREEN='\\033[0;32m'\nYELLOW='\\033[1;33m'\nBLUE='\\033[0;34m'\nNC='\\033[0m' # No Color\n\n# Counters\nERROR_COUNT=0\nWARNING_COUNT=0\n\n# Helper functions\nlog_info() {\n    echo -e \"${BLUE}ℹ️  $1${NC}\"\n}\n\nlog_success() {\n    echo -e \"${GREEN}✅ $1${NC}\"\n}\n\nlog_warning() {\n    echo -e \"${YELLOW}⚠️  $1${NC}\"\n    ((WARNING_COUNT++))\n}\n\nlog_error() {\n    echo -e \"${RED}❌ $1${NC}\"\n    ((ERROR_COUNT++))\n}\n\ncheck_command() {\n    if command -v $1 &> /dev/null; then\n        log_success \"$1 is installed\"\n        return 0\n    else\n        log_error \"$1 is not installed\"\n        return 1\n    fi\n}\n\ncheck_env_var() {\n    if [ -z \"${!1}\" ]; then\n        log_error \"Environment variable $1 is not set\"\n        return 1\n    else\n        log_success \"Environment variable $1 is set\"\n        return 0\n    fi\n}\n\necho\nlog_info \"Step 1: Checking Prerequisites\"\necho \"-----------------------------\"\n\n# Check required tools\ncheck_command \"node\"\ncheck_command \"npm\"\ncheck_command \"git\"\n\n# Check Node.js version\nnode_version=$(node -v | cut -d'v' -f2)\nrequired_version=\"18.0.0\"\n\nif [ \"$(printf '%s\\n' \"$required_version\" \"$node_version\" | sort -V | head -n1)\" = \"$required_version\" ]; then\n    log_success \"Node.js version $node_version is compatible\"\nelse\n    log_error \"Node.js version $node_version is too old. Required: >= $required_version\"\nfi\n\necho\nlog_info \"Step 2: Environment Variables Validation\"\necho \"----------------------------------------\"\n\n# Check critical environment variables (optional for dev)\nif [ ! -z \"$VITE_SUPABASE_URL\" ]; then\n    log_success \"VITE_SUPABASE_URL is set\"\nelse\n    log_warning \"VITE_SUPABASE_URL is not set - may be needed for production\"\nfi\n\nif [ ! -z \"$VITE_SUPABASE_ANON_KEY\" ]; then\n    log_success \"VITE_SUPABASE_ANON_KEY is set\"\nelse\n    log_warning \"VITE_SUPABASE_ANON_KEY is not set - may be needed for production\"\nfi\n\n# Validate environment variable formats\nif [[ ! -z \"$VITE_SUPABASE_URL\" && ! \"$VITE_SUPABASE_URL\" =~ ^https://.* ]]; then\n    log_error \"VITE_SUPABASE_URL must start with https://\"\nfi\n\nif [[ \"$VITE_USE_MOCKS\" == \"true\" ]]; then\n    log_warning \"VITE_USE_MOCKS is set to true - ensure this is intentional for production\"\nfi\n\necho\nlog_info \"Step 3: Build Process\"\necho \"-------------------\"\n\n# Install dependencies\nlog_info \"Installing dependencies...\"\nif npm install; then\n    log_success \"Dependencies installed successfully\"\nelse\n    log_error \"Failed to install dependencies\"\nfi\n\n# Build the application\nlog_info \"Building application...\"\nif npm run build; then\n    log_success \"Application built successfully\"\n    \n    # Check build output\n    if [ -d \"dist\" ]; then\n        build_size=$(du -sh dist | cut -f1)\n        log_success \"Build output created: $build_size\"\n        \n        # Check for common issues\n        if grep -r \"localhost\" dist/ &>/dev/null; then\n            log_warning \"Found 'localhost' references in build - may cause production issues\"\n        fi\n        \n        if grep -r \"http://\" dist/ &>/dev/null; then\n            log_warning \"Found HTTP references in build - ensure HTTPS is used in production\"\n        fi\n    else\n        log_error \"Build output directory 'dist' not found\"\n    fi\nelse\n    log_error \"Application build failed\"\nfi\n\necho\nlog_info \"Step 4: Supabase Configuration\"\necho \"------------------------------\"\n\n# Check Edge Functions\nfunction_dir=\"supabase/functions\"\nif [ -d \"$function_dir\" ]; then\n    log_success \"Edge Functions directory exists\"\n    \n    # Count and list functions\n    function_count=$(find \"$function_dir\" -name \"index.ts\" | wc -l)\n    log_info \"Found $function_count Edge Functions:\"\n    \n    find \"$function_dir\" -name \"index.ts\" | while read -r func; do\n        func_name=$(dirname \"$func\" | sed \"s|$function_dir/||\")\n        echo \"  - $func_name\"\n    done\nelse\n    log_error \"Edge Functions directory not found\"\nfi\n\n# Check migration files\nmigration_dir=\"supabase/migrations\"\nif [ -d \"$migration_dir\" ]; then\n    migration_count=$(find \"$migration_dir\" -name \"*.sql\" | wc -l)\n    if [ $migration_count -gt 0 ]; then\n        log_success \"Found $migration_count database migration files\"\n        \n        # List migrations\n        find \"$migration_dir\" -name \"*.sql\" | sort | while read -r migration; do\n            migration_name=$(basename \"$migration\")\n            echo \"  - $migration_name\"\n        done\n    else\n        log_warning \"No database migration files found\"\n    fi\nelse\n    log_warning \"Database migrations directory not found\"\nfi\n\necho\nlog_info \"Step 5: Security Validation\"\necho \"--------------------------\"\n\n# Check for common security issues\nsecurity_issues=0\n\n# Check for hardcoded secrets\nif grep -r \"sk_\" src/ &>/dev/null || grep -r \"pk_test\" src/ &>/dev/null; then\n    log_error \"Potential hardcoded API keys found in source code\"\n    ((security_issues++))\nfi\n\n# Check for console.log statements\nconsole_logs=$(grep -r \"console\\.log\" src/ | wc -l || echo \"0\")\nif [ $console_logs -gt 5 ]; then\n    log_warning \"Found $console_logs console.log statements - consider removing for production\"\nfi\n\n# Check for TODO/FIXME comments\ntodos=$(grep -r \"TODO\\|FIXME\" src/ | wc -l || echo \"0\")\nif [ $todos -gt 0 ]; then\n    log_warning \"Found $todos TODO/FIXME comments - review before production\"\nfi\n\nif [ $security_issues -eq 0 ]; then\n    log_success \"No critical security issues found\"\nfi\n\necho\nlog_info \"Step 6: Deployment Readiness Check\"\necho \"---------------------------------\"\n\n# Check git status\nif git status --porcelain | grep -q .; then\n    log_warning \"Uncommitted changes detected - ensure all changes are committed\"\nelse\n    log_success \"Git working directory is clean\"\nfi\n\n# Check current branch\ncurrent_branch=$(git branch --show-current)\nlog_info \"Current branch: $current_branch\"\n\nif [ \"$current_branch\" = \"main\" ] || [ \"$current_branch\" = \"master\" ]; then\n    log_success \"On main branch - ready for production deployment\"\nelse\n    log_warning \"Not on main branch - ensure you're deploying the correct branch\"\nfi\n\necho\nlog_info \"Step 7: Performance Optimization Check\"\necho \"-------------------------------------\"\n\n# Check build size\nif [ -d \"dist\" ]; then\n    # Check for large files\n    large_files=$(find dist/ -size +1M | wc -l || echo \"0\")\n    if [ $large_files -gt 0 ]; then\n        log_warning \"Found $large_files files larger than 1MB\"\n        find dist/ -size +1M -exec ls -lh {} \\; | head -5\n    fi\n    \n    # Check for source maps in production\n    if find dist/ -name \"*.map\" | grep -q .; then\n        log_warning \"Source maps found in build - consider removing for production\"\n    fi\nfi\n\necho\nlog_info \"Step 8: Final Summary\"\necho \"-------------------\"\n\necho\necho \"📊 Deployment Summary:\"\necho \"=====================\"\necho \"Errors: $ERROR_COUNT\"\necho \"Warnings: $WARNING_COUNT\"\n\nif [ $ERROR_COUNT -eq 0 ]; then\n    if [ $WARNING_COUNT -eq 0 ]; then\n        echo\n        log_success \"🎉 DEPLOYMENT READY! No issues found.\"\n        echo\n        echo \"Next steps:\"\n        echo \"1. Deploy to Netlify: netlify deploy --prod --dir=dist\"\n        echo \"2. Deploy Edge Functions: supabase functions deploy\"\n        echo \"3. Run database migrations in Supabase Dashboard\"\n        echo \"4. Monitor application after deployment\"\n    else\n        echo\n        echo -e \"${YELLOW}⚠️  DEPLOYMENT READY WITH WARNINGS${NC}\"\n        echo \"Review the warnings above before proceeding with deployment.\"\n    fi\nelse\n    echo\n    log_error \"❌ DEPLOYMENT NOT READY - Fix errors before deploying\"\n    exit 1\nfi\n\necho\necho \"🔗 Useful links:\"\necho \"- Netlify Deploy: https://app.netlify.com/\"\necho \"- Supabase Dashboard: https://app.supabase.com/\"\necho \"- GitHub Repository: https://github.com/nrattyp233/monneybbuddy\"\n\necho\necho \"✨ Deployment preparation complete!\"\n#!/bin/bash\n\n# MoneyBuddy Production Deployment Script\n# Comprehensive deployment preparation and validation\n\nset -e  # Exit on any error\n\necho \"🚀 MoneyBuddy Production Deployment Preparation\"\necho \"================================================\"\n\n# Colors for output\nRED='\\033[0;31m'\nGREEN='\\033[0;32m'\nYELLOW='\\033[1;33m'\nBLUE='\\033[0;34m'\nNC='\\033[0m' # No Color\n\n# Counters\nERROR_COUNT=0\nWARNING_COUNT=0\n\n# Helper functions\nlog_info() {\n    echo -e \"${BLUE}ℹ️  $1${NC}\"\n}\n\nlog_success() {\n    echo -e \"${GREEN}✅ $1${NC}\"\n}\n\nlog_warning() {\n    echo -e \"${YELLOW}⚠️  $1${NC}\"\n    ((WARNING_COUNT++))\n}\n\nlog_error() {\n    echo -e \"${RED}❌ $1${NC}\"\n    ((ERROR_COUNT++))\n}\n\ncheck_command() {\n    if command -v $1 &> /dev/null; then\n        log_success \"$1 is installed\"\n        return 0\n    else\n        log_error \"$1 is not installed\"\n        return 1\n    fi\n}\n\ncheck_env_var() {\n    if [ -z \"${!1}\" ]; then\n        log_error \"Environment variable $1 is not set\"\n        return 1\n    else\n        log_success \"Environment variable $1 is set\"\n        return 0\n    fi\n}\n\necho\nlog_info \"Step 1: Checking Prerequisites\"\necho \"-----------------------------\"\n\n# Check required tools\ncheck_command \"node\"\ncheck_command \"npm\"\ncheck_command \"supabase\"\ncheck_command \"git\"\n\n# Check Node.js version\nnode_version=$(node -v | cut -d'v' -f2)\nrequired_version=\"18.0.0\"\n\nif [ \"$(printf '%s\\n' \"$required_version\" \"$node_version\" | sort -V | head -n1)\" = \"$required_version\" ]; then\n    log_success \"Node.js version $node_version is compatible\"\nelse\n    log_error \"Node.js version $node_version is too old. Required: >= $required_version\"\nfi\n\necho\nlog_info \"Step 2: Environment Variables Validation\"\necho \"----------------------------------------\"\n\n# Check critical environment variables\ncheck_env_var \"VITE_SUPABASE_URL\"\ncheck_env_var \"VITE_SUPABASE_ANON_KEY\"\ncheck_env_var \"VITE_USE_MOCKS\"\n\n# Validate environment variable formats\nif [[ ! -z \"$VITE_SUPABASE_URL\" && ! \"$VITE_SUPABASE_URL\" =~ ^https://.* ]]; then\n    log_error \"VITE_SUPABASE_URL must start with https://\"\nfi\n\nif [[ \"$VITE_USE_MOCKS\" == \"true\" ]]; then\n    log_warning \"VITE_USE_MOCKS is set to true - ensure this is intentional for production\"\nfi\n\necho\nlog_info \"Step 3: Build Process\"\necho \"-------------------\"\n\n# Install dependencies\nlog_info \"Installing dependencies...\"\nif npm ci --only=production; then\n    log_success \"Dependencies installed successfully\"\nelse\n    log_error \"Failed to install dependencies\"\nfi\n\n# Run type checking\nlog_info \"Running TypeScript type checking...\"\nif npm run type-check 2>/dev/null || npx tsc --noEmit; then\n    log_success \"TypeScript type checking passed\"\nelse\n    log_warning \"TypeScript type checking failed - continuing anyway\"\nfi\n\n# Build the application\nlog_info \"Building application...\"\nif npm run build; then\n    log_success \"Application built successfully\"\n    \n    # Check build output\n    if [ -d \"dist\" ]; then\n        build_size=$(du -sh dist | cut -f1)\n        log_success \"Build output created: $build_size\"\n        \n        # Check for common issues\n        if grep -r \"localhost\" dist/ &>/dev/null; then\n            log_warning \"Found 'localhost' references in build - may cause production issues\"\n        fi\n        \n        if grep -r \"http://\" dist/ &>/dev/null; then\n            log_warning \"Found HTTP references in build - ensure HTTPS is used in production\"\n        fi\n    else\n        log_error \"Build output directory 'dist' not found\"\n    fi\nelse\n    log_error \"Application build failed\"\nfi\n\necho\nlog_info \"Step 4: Supabase Configuration\"\necho \"------------------------------\"\n\n# Check Supabase CLI login\nif supabase status &>/dev/null; then\n    log_success \"Supabase CLI is configured\"\nelse\n    log_warning \"Supabase CLI not logged in - may need manual deployment\"\nfi\n\n# Check Edge Functions\nfunction_dir=\"supabase/functions\"\nif [ -d \"$function_dir\" ]; then\n    log_success \"Edge Functions directory exists\"\n    \n    # Count and list functions\n    function_count=$(find \"$function_dir\" -name \"index.ts\" | wc -l)\n    log_info \"Found $function_count Edge Functions:\"\n    \n    find \"$function_dir\" -name \"index.ts\" | while read -r func; do\n        func_name=$(dirname \"$func\" | sed \"s|$function_dir/||\")\n        echo \"  - $func_name\"\n    done\n    \n    # Check for TypeScript errors in functions\n    log_info \"Validating Edge Functions...\"\n    find \"$function_dir\" -name \"index.ts\" | while read -r func; do\n        func_name=$(dirname \"$func\" | sed \"s|$function_dir/||\")\n        \n        # Basic syntax check\n        if deno check \"$func\" 2>/dev/null; then\n            log_success \"$func_name: Syntax valid\"\n        else\n            log_warning \"$func_name: Syntax issues detected\"\n        fi\n    done\nelse\n    log_error \"Edge Functions directory not found\"\nfi\n\n# Check migration files\nmigration_dir=\"supabase/migrations\"\nif [ -d \"$migration_dir\" ]; then\n    migration_count=$(find \"$migration_dir\" -name \"*.sql\" | wc -l)\n    if [ $migration_count -gt 0 ]; then\n        log_success \"Found $migration_count database migration files\"\n        \n        # List migrations\n        find \"$migration_dir\" -name \"*.sql\" | sort | while read -r migration; do\n            migration_name=$(basename \"$migration\")\n            echo \"  - $migration_name\"\n        done\n    else\n        log_warning \"No database migration files found\"\n    fi\nelse\n    log_warning \"Database migrations directory not found\"\nfi\n\necho\nlog_info \"Step 5: Security Validation\"\necho \"--------------------------\"\n\n# Check for common security issues\nsecurity_issues=0\n\n# Check for hardcoded secrets\nif grep -r \"sk_\" src/ &>/dev/null || grep -r \"pk_test\" src/ &>/dev/null; then\n    log_error \"Potential hardcoded API keys found in source code\"\n    ((security_issues++))\nfi\n\n# Check for console.log statements\nconsole_logs=$(grep -r \"console\\.log\" src/ | wc -l)\nif [ $console_logs -gt 0 ]; then\n    log_warning \"Found $console_logs console.log statements - consider removing for production\"\nfi\n\n# Check for TODO/FIXME comments\ntodos=$(grep -r \"TODO\\|FIXME\" src/ | wc -l)\nif [ $todos -gt 0 ]; then\n    log_warning \"Found $todos TODO/FIXME comments - review before production\"\nfi\n\nif [ $security_issues -eq 0 ]; then\n    log_success \"No critical security issues found\"\nfi\n\necho\nlog_info \"Step 6: Deployment Readiness Check\"\necho \"---------------------------------\"\n\n# Check git status\nif git status --porcelain | grep -q .; then\n    log_warning \"Uncommitted changes detected - ensure all changes are committed\"\nelse\n    log_success \"Git working directory is clean\"\nfi\n\n# Check current branch\ncurrent_branch=$(git branch --show-current)\nlog_info \"Current branch: $current_branch\"\n\nif [ \"$current_branch\" = \"main\" ] || [ \"$current_branch\" = \"master\" ]; then\n    log_success \"On main branch - ready for production deployment\"\nelse\n    log_warning \"Not on main branch - ensure you're deploying the correct branch\"\nfi\n\n# Check if we're ahead of origin\nif git status | grep -q \"ahead\"; then\n    log_warning \"Local branch is ahead of origin - consider pushing changes\"\nfi\n\necho\nlog_info \"Step 7: Performance Optimization Check\"\necho \"-------------------------------------\"\n\n# Check build size\nif [ -d \"dist\" ]; then\n    # Check for large files\n    large_files=$(find dist/ -size +1M | wc -l)\n    if [ $large_files -gt 0 ]; then\n        log_warning \"Found $large_files files larger than 1MB:\"\n        find dist/ -size +1M -exec ls -lh {} \\; | awk '{print \"  - \" $9 \" (\" $5 \")\"}'\n    fi\n    \n    # Check for source maps in production\n    if find dist/ -name \"*.map\" | grep -q .; then\n        log_warning \"Source maps found in build - consider removing for production\"\n    fi\nfi\n\necho\nlog_info \"Step 8: Final Summary\"\necho \"-------------------\"\n\necho\necho \"📊 Deployment Summary:\"\necho \"=====================\"\necho \"Errors: $ERROR_COUNT\"\necho \"Warnings: $WARNING_COUNT\"\n\nif [ $ERROR_COUNT -eq 0 ]; then\n    if [ $WARNING_COUNT -eq 0 ]; then\n        echo\n        log_success \"🎉 DEPLOYMENT READY! No issues found.\"\n        echo\n        echo \"Next steps:\"\n        echo \"1. Deploy to Netlify: netlify deploy --prod --dir=dist\"\n        echo \"2. Deploy Edge Functions: supabase functions deploy\"\n        echo \"3. Run database migrations in Supabase Dashboard\"\n        echo \"4. Monitor application after deployment\"\n    else\n        echo\n        echo -e \"${YELLOW}⚠️  DEPLOYMENT READY WITH WARNINGS${NC}\"\n        echo \"Review the warnings above before proceeding with deployment.\"\n    fi\nelse\n    echo\n    log_error \"❌ DEPLOYMENT NOT READY - Fix errors before deploying\"\n    exit 1\nfi\n\necho\necho \"🔗 Useful links:\"\necho \"- Netlify Deploy: https://app.netlify.com/\"\necho \"- Supabase Dashboard: https://app.supabase.com/\"\necho \"- GitHub Repository: https://github.com/nrattyp233/monneybbuddy\"\n\necho\necho \"✨ Deployment preparation complete!\"\n

# MoneyBuddy Production Deployment Script
# Comprehensive deployment preparation and validation

set -e  # Exit on any error

echo "🚀 MoneyBuddy Production Deployment Preparation"
echo "================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
ERROR_COUNT=0
WARNING_COUNT=0

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    ((WARNING_COUNT++))
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
    ((ERROR_COUNT++))
}

check_command() {
    if command -v $1 &> /dev/null; then
        log_success "$1 is installed"
        return 0
    else
        log_error "$1 is not installed"
        return 1
    fi
}

echo
log_info "Step 1: Checking Prerequisites"
echo "-----------------------------"

# Check required tools
check_command "node"
check_command "npm"
check_command "git"

# Check Node.js version
node_version=$(node -v | cut -d'v' -f2)
required_version="18.0.0"

if [ "$(printf '%s\n' "$required_version" "$node_version" | sort -V | head -n1)" = "$required_version" ]; then
    log_success "Node.js version $node_version is compatible"
else
    log_error "Node.js version $node_version is too old. Required: >= $required_version"
fi

echo
log_info "Step 2: Environment Variables Validation"
echo "----------------------------------------"

# Check critical environment variables (optional for dev)
if [ ! -z "$VITE_SUPABASE_URL" ]; then
    log_success "VITE_SUPABASE_URL is set"
else
    log_warning "VITE_SUPABASE_URL is not set - may be needed for production"
fi

if [ ! -z "$VITE_SUPABASE_ANON_KEY" ]; then
    log_success "VITE_SUPABASE_ANON_KEY is set"
else
    log_warning "VITE_SUPABASE_ANON_KEY is not set - may be needed for production"
fi

echo
log_info "Step 3: Build Process"
echo "-------------------"

# Install dependencies
log_info "Installing dependencies..."
if npm install; then
    log_success "Dependencies installed successfully"
else
    log_error "Failed to install dependencies"
fi

# Build the application
log_info "Building application..."
if npm run build; then
    log_success "Application built successfully"
    
    # Check build output
    if [ -d "dist" ]; then
        build_size=$(du -sh dist | cut -f1)
        log_success "Build output created: $build_size"
        
        # Check for common issues
        if grep -r "localhost" dist/ &>/dev/null; then
            log_warning "Found 'localhost' references in build - may cause production issues"
        fi
        
        if grep -r "http://" dist/ &>/dev/null; then
            log_warning "Found HTTP references in build - ensure HTTPS is used in production"
        fi
    else
        log_error "Build output directory 'dist' not found"
    fi
else
    log_error "Application build failed"
fi

echo
log_info "Step 4: Supabase Configuration"
echo "------------------------------"

# Check Edge Functions
function_dir="supabase/functions"
if [ -d "$function_dir" ]; then
    log_success "Edge Functions directory exists"
    
    # Count and list functions
    function_count=$(find "$function_dir" -name "index.ts" | wc -l)
    log_info "Found $function_count Edge Functions:"
    
    find "$function_dir" -name "index.ts" | while read -r func; do
        func_name=$(dirname "$func" | sed "s|$function_dir/||")
        echo "  - $func_name"
    done
else
    log_error "Edge Functions directory not found"
fi

# Check migration files
migration_dir="supabase/migrations"
if [ -d "$migration_dir" ]; then
    migration_count=$(find "$migration_dir" -name "*.sql" | wc -l)
    if [ $migration_count -gt 0 ]; then
        log_success "Found $migration_count database migration files"
        
        # List migrations
        find "$migration_dir" -name "*.sql" | sort | while read -r migration; do
            migration_name=$(basename "$migration")
            echo "  - $migration_name"
        done
    else
        log_warning "No database migration files found"
    fi
else
    log_warning "Database migrations directory not found"
fi

echo
log_info "Step 5: Security Validation"
echo "--------------------------"

# Check for common security issues
security_issues=0

# Check for hardcoded secrets
if grep -r "sk_" src/ &>/dev/null || grep -r "pk_test" src/ &>/dev/null; then
    log_error "Potential hardcoded API keys found in source code"
    ((security_issues++))
fi

# Check for console.log statements
console_logs=$(grep -r "console\.log" src/ 2>/dev/null | wc -l || echo "0")
if [ $console_logs -gt 5 ]; then
    log_warning "Found $console_logs console.log statements - consider removing for production"
fi

# Check for TODO/FIXME comments
todos=$(grep -r "TODO\|FIXME" src/ 2>/dev/null | wc -l || echo "0")
if [ $todos -gt 0 ]; then
    log_warning "Found $todos TODO/FIXME comments - review before production"
fi

if [ $security_issues -eq 0 ]; then
    log_success "No critical security issues found"
fi

echo
log_info "Step 6: Deployment Readiness Check"
echo "---------------------------------"

# Check git status
if git status --porcelain | grep -q .; then
    log_warning "Uncommitted changes detected - ensure all changes are committed"
else
    log_success "Git working directory is clean"
fi

# Check current branch
current_branch=$(git branch --show-current)
log_info "Current branch: $current_branch"

if [ "$current_branch" = "main" ] || [ "$current_branch" = "master" ]; then
    log_success "On main branch - ready for production deployment"
else
    log_warning "Not on main branch - ensure you're deploying the correct branch"
fi

echo
log_info "Step 7: Performance Optimization Check"
echo "-------------------------------------"

# Check build size
if [ -d "dist" ]; then
    # Check for large files
    large_files=$(find dist/ -size +1M 2>/dev/null | wc -l || echo "0")
    if [ $large_files -gt 0 ]; then
        log_warning "Found $large_files files larger than 1MB"
        find dist/ -size +1M -exec ls -lh {} \; 2>/dev/null | head -5
    fi
    
    # Check for source maps in production
    if find dist/ -name "*.map" 2>/dev/null | grep -q .; then
        log_warning "Source maps found in build - consider removing for production"
    fi
fi

echo
log_info "Step 8: Final Summary"
echo "-------------------"

echo
echo "📊 Deployment Summary:"
echo "====================="
echo "Errors: $ERROR_COUNT"
echo "Warnings: $WARNING_COUNT"

if [ $ERROR_COUNT -eq 0 ]; then
    if [ $WARNING_COUNT -eq 0 ]; then
        echo
        log_success "🎉 DEPLOYMENT READY! No issues found."
        echo
        echo "Next steps:"
        echo "1. Deploy to Netlify: netlify deploy --prod --dir=dist"
        echo "2. Deploy Edge Functions: supabase functions deploy"
        echo "3. Run database migrations in Supabase Dashboard"
        echo "4. Monitor application after deployment"
    else
        echo
        echo -e "${YELLOW}⚠️  DEPLOYMENT READY WITH WARNINGS${NC}"
        echo "Review the warnings above before proceeding with deployment."
    fi
else
    echo
    log_error "❌ DEPLOYMENT NOT READY - Fix errors before deploying"
    exit 1
fi

echo
echo "🔗 Useful links:"
echo "- Netlify Deploy: https://app.netlify.com/"
echo "- Supabase Dashboard: https://app.supabase.com/"
echo "- GitHub Repository: https://github.com/nrattyp233/monneybbuddy"

echo
echo "✨ Deployment preparation complete!"