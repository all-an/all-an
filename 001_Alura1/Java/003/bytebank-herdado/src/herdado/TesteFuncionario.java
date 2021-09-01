package herdado;

public class TesteFuncionario {
	public static void main(String[] args) {
		Funcionario nico = new Funcionario(); //referencia criada e objeto INICIALIZADO
		
		nico.setCpf("12343242");
		nico.setNome("Nico");
		nico.setSalario(1000.00);
		
		System.out.println(nico.getBonificacao()); //chamou um método como argumento
		System.out.println(nico.getNome()); 
	}
}
