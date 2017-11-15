class UserRegistrationService
  def initialize(params = nil)
    @errors = {}
    return unless params
    
    params.each do |name, value|
      instance_variable_set("@#{name}", value)
    end
    
    @user = User.new(params.slice(:first_name, :last_name, :email))
    JsonWebToken.new_jti(@user)
  end
  
  def save
    ActiveRecord::Base.transaction do
      load_company
      load_role if @company.present?
      save_user if @role.present?
      save_user_relation if @user.present?
    end
    @errors.present? ? false : true
  end
  
  def errors
    @errors
  end
  
  def user
    @user
  end
  
  private
  
  def load_company
    @company = Company.find_by(id: @company_id)
    unless @company
      @errors.merge!({company: I18n.t(:company_nof_found)})
    end
  end
  
  def load_role
    @role = Role.find_by(id: @role_id)
    unless @company
      @errors.merge!({role: I18n.t(:role_not_found)})
    end
  end
  
  def save_user
    @user.skip_password_validation = true
    @user.skip_confirmation!
    @user.skip_confirmation_notification!
    @user.send_reset_password_instructions if @user.save
    merge_errors(@user)
  end
  
  def save_user_relation
    @user_role_relation = UserRoleRelation.create(company: @company, role: @role, user: @user)
    merge_errors(@user_role_relation)
  end
  
  def merge_errors(record)
    @errors.merge!(record.errors.messages) if record.errors.any?
  end
end
