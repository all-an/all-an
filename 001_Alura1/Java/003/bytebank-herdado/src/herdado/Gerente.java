package herdado;

public class Gerente {
		private String nome;
		private String cpf;
		private double salario;
		public int senha;
		
		public double getBonificacao() {  //get foi usado somente como nome do modulo mas n�o se refere a um atributo
			return this.salario; //gerente ganha um salario inteiro de bonifica��o
		}
		
		public String getNome() {
			return nome;
		}
		
		public void setNome(String nome) {
			this.nome = nome;
		}
		public String getCpf() {
			return cpf;
		}
		public void setCpf(String cpf) {
			this.cpf = cpf;
		}
		public double getSalario() {
			return salario;
		}
		public void setSalario(double salario) {
			this.salario = salario;
		}

}
